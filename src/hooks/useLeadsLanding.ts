import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Submissão de candidaturas da landing pública (RentCarLanding).
 *
 * Extraído de dentro do handler do componente, onde viviam três
 * `supabase.from()` directos — o que a regra `no-restricted-syntax` sinaliza e
 * o AGENTS.md §1 proíbe ("Hooks são o único ponto de acesso a Supabase").
 *
 * Ao trazer o fluxo para aqui, a única lógica de negócio daquele ficheiro
 * (a regra das campanhas) passa a ser uma função pura testável, em vez de
 * estar entalada a meio de um `try` de 150 linhas.
 */

/** Campanha genérica de TVDE — não serve quem ainda não tem formação. */
const CAMPANHA_GERAL = 'TVDE GERAL';
/** Campanha para quem se candidata sem formação TVDE feita. */
const CAMPANHA_FORMACAO = 'Formação TVDE';

/** Janela de deduplicação: a mesma pessoa a carregar duas vezes em "enviar". */
const JANELA_DUPLICADO_MS = 5 * 60 * 1000;

/**
 * Quem declara NÃO ter formação TVDE sai da campanha genérica e entra na de
 * formação. Só actua no `false` explícito: `null` (não respondeu) e `true`
 * ficam como estão — é o comportamento que já existia, agora legível e testado.
 */
export function aplicarRegraFormacaoTvde(
  campanhas: string[],
  temFormacaoTvde: boolean | null
): string[] {
  if (temFormacaoTvde !== false) return campanhas;

  const semGeral = campanhas.filter((tag) => tag !== CAMPANHA_GERAL);
  return semGeral.includes(CAMPANHA_FORMACAO) ? semGeral : [...semGeral, CAMPANHA_FORMACAO];
}

export interface LeadLandingInput {
  nome: string;
  email: string;
  tem_formacao_tvde: boolean | null;
  [campo: string]: unknown;
}

export interface SubmeterLeadArgs {
  /** Formulário de origem — traz as campanhas associadas. */
  formularioId?: string;
  lead: LeadLandingInput;
}

/** `duplicado: true` quando já houve uma candidatura igual há minutos. */
export interface SubmeterLeadResultado {
  duplicado: boolean;
}

export function useSubmeterLeadLanding() {
  return useMutation({
    mutationFn: async ({
      formularioId,
      lead,
    }: SubmeterLeadArgs): Promise<SubmeterLeadResultado> => {
      let campanhas: string[] = [];
      if (formularioId) {
        const { data, error } = await supabase
          .from('formulario_campanhas')
          .select('campanha_tag')
          .eq('formulario_id', formularioId);
        if (error) throw error;
        campanhas = (data ?? []).map((c) => c.campanha_tag);
      }

      const campaign_tags = aplicarRegraFormacaoTvde(campanhas, lead.tem_formacao_tvde);

      // Duplo envio (duplo clique, voltar atrás e reenviar): a mesma pessoa a
      // candidatar-se duas vezes em minutos é um acidente, não dois leads.
      const desde = new Date(Date.now() - JANELA_DUPLICADO_MS).toISOString();
      const { data: existente, error: erroDup } = await supabase
        .from('leads_dasprent')
        .select('id')
        .eq('email', lead.email)
        .gte('created_at', desde)
        .maybeSingle();
      if (erroDup) throw erroDup;
      if (existente) return { duplicado: true };

      const { error } = await supabase
        .from('leads_dasprent')
        .insert({ ...lead, campaign_tags } as never);
      if (error) throw error;

      return { duplicado: false };
    },
  });
}
