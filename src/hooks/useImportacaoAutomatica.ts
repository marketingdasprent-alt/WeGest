import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { enviarImportacao, lerFicheiroComoTexto } from '@/lib/importacaoPlataformas';
import {
  contaImportacaoDe,
  decidirConta,
  detectarPlataforma,
  identificadoresDoFicheiro,
  periodoDoNomeFicheiro,
  PLATAFORMAS_SEMANAIS,
  type ContaImportacao,
  type Deteccao,
  type Periodo,
  type PlataformaImportacao,
  type Sobreposicao,
} from '@/utils/importacaoAutomatica';
import type { ResultadoImportacao } from '@/utils/respostaImportacao';

export interface FicheiroAnalisado {
  chave: string;
  ficheiro: File;
  texto: string;
  plataforma: PlataformaImportacao | null;
  periodo: Periodo | null;
  identificadores: number;
  deteccao: Deteccao;
}

export interface AnaliseImportacao {
  ficheiros: FicheiroAnalisado[];
  /** Por semana (início), as contas que já têm dados dessa semana. */
  comDados: Record<string, string[]>;
}

const SEMANAS_HISTORICO = 8;

/** Identifica um ficheiro largado (o mesmo ficheiro duas vezes conta uma). */
export const chaveDoFicheiro = (f: File) => [f.name, f.size, f.lastModified].join('-');

const menosDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

export function useContasImportacao(enabled = true) {
  return useQuery({
    queryKey: ['contas-importacao'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plataformas_configuracao')
        .select('id, nome, company_name, plataforma, robot_target_platform')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return (data ?? []).map(contaImportacaoDe).filter((c): c is ContaImportacao => !!c);
    },
  });
}

/**
 * Em que contas trabalharam estes motoristas nas 8 semanas antes da do ficheiro.
 * A própria semana fica de fora: uma importação errada dela não pode votar.
 */
async function sobreposicaoPorConta(
  plataforma: 'uber' | 'bolt',
  ids: string[],
  antesDe: string
): Promise<Record<string, Sobreposicao>> {
  const de = menosDias(antesDe, 7 * SEMANAS_HISTORICO);
  const lerLote = async (lote: string[]) => {
    const { data, error } =
      plataforma === 'uber'
        ? await supabase
            .from('uber_resumos_semanais')
            .select('integracao_id, id:uber_driver_id')
            .in('uber_driver_id', lote)
            .gte('periodo_inicio', de)
            .lt('periodo_inicio', antesDe)
        : await supabase
            .from('bolt_resumos_semanais')
            .select('integracao_id, id:identificador_motorista')
            .in('identificador_motorista', lote)
            .gte('periodo_inicio', de)
            .lt('periodo_inicio', antesDe);
    if (error) throw error;
    return (data ?? []) as Array<{ integracao_id: string; id: string | null }>;
  };
  const linhas: Array<{ integracao_id: string; id: string | null }> = [];
  for (let i = 0; i < ids.length; i += 40) linhas.push(...(await lerLote(ids.slice(i, i + 40))));

  const porConta: Record<string, { linhas: number; ids: Set<string> }> = {};
  for (const l of linhas) {
    const c = (porConta[l.integracao_id] ??= { linhas: 0, ids: new Set() });
    c.linhas++;
    if (l.id) c.ids.add(l.id);
  }
  return Object.fromEntries(
    Object.entries(porConta).map(([k, v]) => [k, { linhas: v.linhas, motoristas: v.ids.size }])
  );
}

export async function contasComDadosNaSemana(inicio: string): Promise<string[]> {
  const [uber, bolt] = await Promise.all([
    supabase.from('uber_resumos_semanais').select('integracao_id').eq('periodo_inicio', inicio),
    supabase.from('bolt_resumos_semanais').select('integracao_id').eq('periodo_inicio', inicio),
  ]);
  if (uber.error) throw uber.error;
  if (bolt.error) throw bolt.error;
  return [...new Set([...(uber.data ?? []), ...(bolt.data ?? [])].map((r) => r.integracao_id))];
}

async function analisar(ficheiros: File[], contas: ContaImportacao[]): Promise<AnaliseImportacao> {
  const hoje = new Date().toISOString().slice(0, 10);
  const analisados: FicheiroAnalisado[] = [];
  for (const ficheiro of ficheiros) {
    const texto = await lerFicheiroComoTexto(ficheiro);
    const plataforma = detectarPlataforma(texto);
    const periodo = periodoDoNomeFicheiro(ficheiro.name);
    const ids = plataforma ? identificadoresDoFicheiro(plataforma, texto) : [];
    const sobreposicao =
      (plataforma === 'uber' || plataforma === 'bolt') && ids.length > 0
        ? await sobreposicaoPorConta(plataforma, ids, periodo?.inicio ?? hoje)
        : {};
    const deteccao: Deteccao = plataforma
      ? decidirConta({
          plataforma,
          nomeFicheiro: ficheiro.name,
          contas,
          totalIdentificadores: ids.length,
          sobreposicao,
        })
      : { contaId: null, estado: 'desconhecido', motivo: 'Ficheiro não reconhecido.' };
    analisados.push({
      chave: chaveDoFicheiro(ficheiro),
      ficheiro,
      texto,
      plataforma,
      periodo,
      identificadores: ids.length,
      deteccao,
    });
  }
  const semanas = new Set(
    analisados
      .filter((a) => a.plataforma && PLATAFORMAS_SEMANAIS.includes(a.plataforma) && a.periodo)
      .map((a) => a.periodo!.inicio)
  );
  const comDados: Record<string, string[]> = {};
  for (const s of semanas) comDados[s] = await contasComDadosNaSemana(s);
  return { ficheiros: analisados, comDados };
}

export function useAnalisarFicheiros(contas: ContaImportacao[]) {
  return useMutation({ mutationFn: (ficheiros: File[]) => analisar(ficheiros, contas) });
}

export interface ImportacaoAPedido {
  chave: string;
  plataforma: PlataformaImportacao;
  contaId: string;
  periodo: Periodo | null;
  texto: string;
  nomeFicheiro: string;
}

export type ResultadoFicheiro =
  | { chave: string; ok: true; resultado: ResultadoImportacao }
  | { chave: string; ok: false; erro: string };

/** Importa ficheiro a ficheiro: um que falhe não impede os outros. */
export function useExecutarImportacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pedidos: ImportacaoAPedido[]): Promise<ResultadoFicheiro[]> => {
      const resultados: ResultadoFicheiro[] = [];
      for (const p of pedidos) {
        try {
          const resultado = await enviarImportacao({
            plataforma: p.plataforma,
            integracaoId: p.contaId,
            texto: p.texto,
            nomeFicheiro: p.nomeFicheiro,
            periodo: p.periodo,
            origem: 'Importação automática',
          });
          resultados.push({ chave: p.chave, ok: true, resultado });
        } catch (error: unknown) {
          const erro = error instanceof Error ? error.message : 'Erro inesperado';
          resultados.push({ chave: p.chave, ok: false, erro });
        }
      }
      return resultados;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['combustivel-sem-dono'] });
      qc.invalidateQueries({ queryKey: ['abastecimentos-suspeitos'] });
    },
  });
}
