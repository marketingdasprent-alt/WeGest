import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import type { Motorista } from '@/types/motorista';

const QUERY_KEY = ['motoristas'] as const;

/**
 * A tabela é `motoristas_ativos`, não `motoristas`.
 *
 * Existem as duas, e não são a mesma coisa: `motoristas` tem 265 linhas,
 * `motoristas_ativos` tem 532, e NÃO PARTILHAM UM ÚNICO id. A aplicação lê e
 * escreve `motoristas_ativos` em 47 ficheiros; `motoristas` é a tabela legada,
 * escrita pela última vez a 2026-04-14 pelo excel-import.
 *
 * Este ficheiro lia de uma e escrevia na outra: a lista vinha de
 * `motoristas_ativos` e o criar/actualizar/eliminar ia para `motoristas`. Como
 * os ids não coincidem, eliminar um motorista acertava em ZERO linhas e não
 * dava erro — o ecrã dizia "Motorista eliminado" e não eliminava nada. Criar
 * inseria numa tabela que a lista não lê, portanto o motorista novo nunca
 * aparecia.
 *
 * Nenhuma das três mutações está ligada a um ecrã hoje, por isso isto nunca
 * chegou a partir nada em produção. Ficava à espera de quem ligasse o botão.
 */
const TABELA = 'motoristas_ativos' as const;

interface UseMotoristaOptions {
  /** Se true, retorna apenas motoristas com status_ativo=true (padrão: false) */
  apenasAtivos?: boolean;
  /** Se true, retorna apenas motoristas de slot (is_slot=true), independente
   *  do status — os carros são do motorista, o slot não depende de estar "ativo". */
  apenasSlot?: boolean;
  /** Se false, a query não é executada */
  enabled?: boolean;
}

export function useMotoristas(options: UseMotoristaOptions = {}) {
  const { apenasAtivos = false, apenasSlot = false, enabled = true } = options;

  return useQuery({
    queryKey: ['motoristas', { apenasAtivos, apenasSlot }],
    queryFn: async () => {
      let q = supabase.from(TABELA).select('*').order('nome');

      // Slot: tolerante ao desync flag/valor — mostra quem tem is_slot=true
      // OU um valor semanal de slot definido (slot_valor_semanal > 0).
      if (apenasSlot) q = q.or('is_slot.eq.true,slot_valor_semanal.gt.0');
      else if (apenasAtivos) q = q.eq('status_ativo', true);

      const { data, error } = await q;
      if (error) throw error;
      return data as Motorista[];
    },
    enabled,
  });
}

// ── Mutation: criar ──────────────────────────────────────────

export function useCreateMotorista() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (motorista: TablesInsert<'motoristas_ativos'>) => {
      const { data, error } = await supabase.from(TABELA).insert(motorista).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Motorista criado' });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Erro inesperado';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });
}

// ── Mutation: actualizar ─────────────────────────────────────

export function useUpdateMotorista() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, dados }: { id: string; dados: TablesUpdate<'motoristas_ativos'> }) => {
      const { data, error } = await supabase
        .from(TABELA)
        .update(dados)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Motorista actualizado' });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Erro inesperado';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });
}

// ── Mutation: eliminar ───────────────────────────────────────

export function useDeleteMotorista() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABELA).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Motorista eliminado' });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Erro inesperado';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });
}
