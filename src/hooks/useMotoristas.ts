import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import type { Motorista } from '@/types/motorista';

const QUERY_KEY = ['motoristas'] as const;

const TABELA = 'motoristas_ativos' as const;

interface UseMotoristaOptions {
  apenasAtivos?: boolean;

  apenasSlot?: boolean;

  enabled?: boolean;
}

export function useMotoristas(options: UseMotoristaOptions = {}) {
  const { apenasAtivos = false, apenasSlot = false, enabled = true } = options;

  return useQuery({
    queryKey: ['motoristas', { apenasAtivos, apenasSlot }],
    queryFn: async () => {
      let q = supabase.from(TABELA).select('*').order('nome');

      if (apenasSlot) q = q.or('is_slot.eq.true,slot_valor_semanal.gt.0');
      else if (apenasAtivos) q = q.eq('status_ativo', true);

      const { data, error } = await q;
      if (error) throw error;
      return data as Motorista[];
    },
    enabled,
  });
}

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
