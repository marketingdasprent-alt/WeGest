// src/hooks/useDividasMotorista.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  calcularValoresDivida,
  type ValoresDivida,
  type MovimentoParaDivida,
} from '@/lib/calculoDivida';

export interface Divida {
  id: string;
  motorista_id: string;
  motorista_nome: string;
  periodo_inicio: string;
  periodo_fim: string;
  valor_periodo: number;
  valor_danos: number;
  valor_caucao: number;
  valor_total: number;
  estado: 'por_cobrar' | 'paga' | 'cancelada';
  pago_em: string | null;
  criado_por_nome: string | null;
  created_at: string;
}

export interface DividaCalculada extends ValoresDivida {
  motoristaNome: string;
}

const MOVIMENTO_SELECT = 'tipo, categoria, valor, status';

/** Igual ao helper privado de useTiTickets.ts — mesma origem (profiles.nome),
 *  não vale a pena partilhar por 6 linhas usadas em dois sítios. */
async function nomeDaSessao(): Promise<string | null> {
  try {
    const { data: user } = await supabase.auth.getUser();
    const uid = user?.user?.id;
    if (!uid) return null;
    const { data } = await supabase.from('profiles').select('nome').eq('id', uid).single();
    return (data as { nome?: string | null } | null)?.nome ?? null;
  } catch {
    return null;
  }
}

export function useDividasMotorista(filtros: { pesquisa?: string; estado?: string }) {
  return useQuery({
    queryKey: ['dividas-motorista', filtros.pesquisa ?? '', filtros.estado ?? ''],
    queryFn: async () => {
      let query = supabase
        .from('dividas_motorista')
        .select('*')
        .order('created_at', { ascending: false });
      if (filtros.estado) query = query.eq('estado', filtros.estado);
      if (filtros.pesquisa) query = query.ilike('motorista_nome', `%${filtros.pesquisa}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Divida[];
    },
  });
}

export function useCalcularDivida(
  motoristaId: string | null,
  periodo: { inicio: string; fim: string } | null
) {
  const valido =
    !!motoristaId && !!periodo?.inicio && !!periodo?.fim && periodo.inicio <= periodo.fim;
  return useQuery({
    queryKey: ['divida-calculo', motoristaId, periodo?.inicio, periodo?.fim],
    queryFn: async (): Promise<DividaCalculada> => {
      const [periodoRes, caucaoRes, motoristaRes] = await Promise.all([
        supabase
          .from('motorista_financeiro')
          .select(MOVIMENTO_SELECT)
          .eq('motorista_id', motoristaId as string)
          .gte('data_movimento', periodo!.inicio)
          .lte('data_movimento', periodo!.fim),
        supabase
          .from('motorista_financeiro')
          .select(MOVIMENTO_SELECT)
          .eq('motorista_id', motoristaId as string)
          .eq('categoria', 'caucao'),
        supabase
          .from('motoristas_ativos')
          .select('nome')
          .eq('id', motoristaId as string)
          .single(),
      ]);
      if (periodoRes.error) throw periodoRes.error;
      if (caucaoRes.error) throw caucaoRes.error;
      if (motoristaRes.error) throw motoristaRes.error;

      const valores = calcularValoresDivida(
        (periodoRes.data ?? []) as MovimentoParaDivida[],
        (caucaoRes.data ?? []) as MovimentoParaDivida[]
      );
      return { ...valores, motoristaNome: (motoristaRes.data as { nome: string }).nome };
    },
    enabled: valido,
  });
}

export function useCriarDivida() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      motoristaId: string;
      motoristaNome: string;
      periodoInicio: string;
      periodoFim: string;
      valores: ValoresDivida;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from('dividas_motorista').insert({
        motorista_id: input.motoristaId,
        motorista_nome: input.motoristaNome,
        periodo_inicio: input.periodoInicio,
        periodo_fim: input.periodoFim,
        valor_periodo: input.valores.valorPeriodo,
        valor_danos: input.valores.valorDanos,
        valor_caucao: input.valores.valorCaucao,
        valor_total: input.valores.valorTotal,
        criado_por: user?.user?.id ?? null,
        criado_por_nome: await nomeDaSessao(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dividas-motorista'] });
    },
  });
}

export function useAtualizarEstadoDivida() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: 'paga' | 'cancelada' }) => {
      const { error } = await supabase
        .from('dividas_motorista')
        .update({ estado, pago_em: estado === 'paga' ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dividas-motorista'] });
    },
  });
}
