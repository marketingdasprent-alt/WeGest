/**
 * Hooks do parcelamento de faturas (Fase 4A). Consomem o backend já
 * implementado e revisto (acordos_pagamento, acordo_parcelas, acordo_criar,
 * faturacao-emitir). `as any` nos nomes de tabela/RPC: types.ts ainda não foi
 * regenerado para estas tabelas — mesmo padrão de src/lib/acordoPagamento.ts.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ParcelaPlano, FrequenciaParcela } from '@/lib/parcelamento';

const QUERY_KEY_BASE = ['acordos-pagamento'] as const;

export interface AcordoAtivoInfo {
  id: string;
  codigo: number;
  estado: string;
}

/** Existe já um acordo vivo (ativo|incumprimento) sobre esta cobrança? Bloqueia o botão de parcelar. */
export function useAcordoAtivoPorCobranca(cobrancaId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'ativo', cobrancaId ?? null],
    queryFn: async (): Promise<AcordoAtivoInfo | null> => {
      if (!cobrancaId) return null;
      const { data, error } = await supabase
        .from('acordos_pagamento' as any)
        .select('id, codigo, estado')
        .eq('cobranca_id', cobrancaId)
        .in('estado', ['ativo', 'incumprimento'])
        .maybeSingle();
      if (error) throw error;
      // `acordos_pagamento` não existe em types.ts (ver nota do topo do ficheiro):
      // o select-string parser do postgrest-js não consegue validar o shape
      // contra um schema desconhecido e devolve um SelectQueryError opaco, que
      // nunca tem overlap suficiente com AcordoAtivoInfo para um cast directo —
      // daí o passo por `unknown`, tal como o próprio erro do tsc recomenda.
      return data as unknown as AcordoAtivoInfo | null;
    },
    enabled: !!cobrancaId,
    staleTime: 15_000,
  });
}

export interface ResponsavelElegivel {
  papel: 'condutor' | 'motorista';
  /** cliente_id quando papel='condutor'; motorista_id quando papel='motorista'. */
  id: string;
  nome: string | null;
}

/**
 * Candidatos a "quem assume o pagamento" além do titular: condutores/motoristas
 * ligados ao contrato. Espelha o JOIN de useContratoCondutoresPrincipais
 * (useContratoCondutores.ts), sem o filtro is_principal — precisa de todos.
 */
export function useAcordoResponsaveisElegiveis(contratoId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'responsaveis', contratoId ?? null],
    queryFn: async (): Promise<ResponsavelElegivel[]> => {
      if (!contratoId) return [];
      const { data, error } = await supabase
        .from('contrato_condutores')
        .select('cliente_id, motorista_id, clientes(nome)')
        .eq('contrato_id', contratoId)
        .is('data_fim', null);
      if (error) throw error;
      // TVDE fatura-se fora do WeGest — acordo_criar recusa sempre
      // responsavel_papel='motorista' (ver migration 20260724100001). Nunca
      // oferecer motorista como candidato elegível: seria um caminho
      // garantido a falhar, com um erro cru da BD mostrado ao utilizador.
      return (data ?? [])
        .filter((c: any) => !c.motorista_id)
        .map(
          (c: any): ResponsavelElegivel => ({
            papel: 'condutor',
            id: c.cliente_id,
            nome: c.clientes?.nome ?? null,
          })
        );
    },
    enabled: !!contratoId,
    staleTime: 30_000,
  });
}

export interface CriarAcordoInput {
  cobrancaId: string;
  responsavelPapel: 'cliente' | 'condutor' | 'motorista';
  responsavelId: string;
  parcelas: ParcelaPlano[];
  frequencia: FrequenciaParcela;
  diaVencimento?: number;
  avisoAntecedenciaDias?: number;
  observacoes?: string;
}

/**
 * Cria o acordo (RPC acordo_criar — transacional, backend Tarefa 3). Só
 * invalida a query de "acordo vivo" desta cobrança; o chamador (ParcelamentoDialog)
 * é responsável por invalidar o resto (lista de cobranças) via onCriado(),
 * exactamente como RecibosDialog.onEmitido já funciona.
 */
export function useCriarAcordo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CriarAcordoInput): Promise<string> => {
      const { data, error } = await supabase.rpc('acordo_criar' as any, {
        p_cobranca_id: input.cobrancaId,
        p_responsavel_papel: input.responsavelPapel,
        p_responsavel_id: input.responsavelId,
        p_parcelas: input.parcelas,
        p_frequencia: input.frequencia,
        p_dia_vencimento: input.diaVencimento ?? null,
        p_aviso_antecedencia_dias: input.avisoAntecedenciaDias ?? 3,
        p_observacoes: input.observacoes ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [...QUERY_KEY_BASE, 'ativo', vars.cobrancaId] });
    },
  });
}

export interface PreflightResult {
  ok: boolean;
  provider?: string;
  rc_configurado: boolean;
  error?: string;
}

/** Pré-voo: esta org consegue emitir Recibos? Ver faturacao-emitir (backend Tarefa 6). */
export function useFaturacaoPreflight() {
  return useMutation({
    mutationFn: async (): Promise<PreflightResult> => {
      const { data, error } = await supabase.functions.invoke<PreflightResult>('faturacao-emitir', {
        body: { action: 'preflight' },
      });
      if (error) throw new Error(error.message || 'Falha a contactar o serviço de faturação');
      return data ?? { ok: false, rc_configurado: false, error: 'Resposta vazia do servidor' };
    },
  });
}
