import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchPerfisOrg } from '@/hooks/usePerfisOrg';
import { getDanoEstadoLabel } from '@/utils/danoEstados';

export type DanoHistoricoCampo = 'estado' | 'observacoes';

export interface DanoHistoricoEntrada {
  id: string;
  campo: DanoHistoricoCampo;
  valorAnterior: string | null;
  valorNovo: string | null;
  atorNome: string | null;
  criadoEm: string;
}

interface DanoHistoricoRow {
  id: string;
  campo: DanoHistoricoCampo;
  valor_anterior: string | null;
  valor_novo: string | null;
  ator_id: string | null;
  criado_em: string;
}

/** Texto de uma linha do histórico, ex. "Existente → Aguarda Peritagem". */
export function descreverPassoDano(entrada: DanoHistoricoEntrada): string {
  if (entrada.campo === 'observacoes') return 'Observações alteradas';
  if (entrada.valorAnterior === null)
    return `Registado como ${getDanoEstadoLabel(entrada.valorNovo)}`;
  return `${getDanoEstadoLabel(entrada.valorAnterior)} → ${getDanoEstadoLabel(entrada.valorNovo)}`;
}

export async function fetchDanoHistorico(danoId: string): Promise<DanoHistoricoEntrada[]> {
  // viatura_dano_historico ainda não está no types.ts (migração 20261023100000).
  const { data, error } = await supabase
    .from('viatura_dano_historico' as never)
    .select('id, campo, valor_anterior, valor_novo, ator_id, criado_em')
    .eq('dano_id', danoId)
    .order('criado_em', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as unknown as DanoHistoricoRow[];
  const perfis = await fetchPerfisOrg(
    rows.map((r) => r.ator_id).filter((id): id is string => !!id)
  );
  const nomes = new Map(perfis.map((p) => [p.id, p.nome]));

  return rows.map((r) => ({
    id: r.id,
    campo: r.campo,
    valorAnterior: r.valor_anterior,
    valorNovo: r.valor_novo,
    atorNome: r.ator_id ? (nomes.get(r.ator_id) ?? null) : null,
    criadoEm: r.criado_em,
  }));
}

export function useDanoHistorico(danoId: string, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ['dano-historico', danoId],
    queryFn: () => fetchDanoHistorico(danoId),
    enabled,
  });
}

export async function atualizarObservacoesDano(danoId: string, texto: string): Promise<void> {
  const { data, error } = await supabase
    .from('viatura_danos')
    .update({ observacoes: texto.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', danoId)
    .select('id');
  if (error) throw error;
  // O RLS não dá erro quando recusa um UPDATE: só devolve zero linhas.
  if (!data || data.length === 0) throw new Error('Sem permissão para editar este dano');
}

export function useAtualizarObservacoesDano() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ danoId, texto }: { danoId: string; texto: string }) =>
      atualizarObservacoesDano(danoId, texto),
    onSuccess: (_data, { danoId }) => {
      qc.invalidateQueries({ queryKey: ['dano-historico', danoId] });
    },
  });
}
