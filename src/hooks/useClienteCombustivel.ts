import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CartaoDoCliente {
  id: string;
  numero: string;
  tipo: 'bp' | 'repsol' | 'edp';
  status: string;
  limite: number | null;
  data_entrega: string | null;
}

export interface ConsumoCombustivel {
  total: number;
  transacoes: number;
  porTipo: Record<'bp' | 'repsol' | 'edp', number>;
  gastoCobradoAOutro: number;
}

export const clienteCartoesKey = (clienteId: string) =>
  ['cliente-combustivel', 'cartoes', clienteId] as const;

export const clienteConsumoKey = (clienteId: string, inicio: string, fim: string) =>
  ['cliente-combustivel', 'consumo', clienteId, inicio, fim] as const;

export function useCartoesDoCliente(clienteId: string | null) {
  return useQuery({
    queryKey: clienteCartoesKey(clienteId ?? ''),
    queryFn: async (): Promise<CartaoDoCliente[]> => {
      const { data, error } = await supabase
        .from('cartoes_frota')
        .select('id, numero, tipo, status, limite, data_entrega')
        .eq('cliente_id', clienteId as string)
        .order('tipo')
        .order('numero');
      if (error) throw error;
      return (data ?? []) as CartaoDoCliente[];
    },
    enabled: !!clienteId,
  });
}

const ORIGENS = [
  { tipo: 'bp' as const, tabela: 'bp_transacoes' as const },
  { tipo: 'repsol' as const, tabela: 'repsol_transacoes' as const },
  { tipo: 'edp' as const, tabela: 'edp_transacoes' as const },
];

export function useConsumoDoCliente(clienteId: string | null, inicio: string, fim: string) {
  return useQuery({
    queryKey: clienteConsumoKey(clienteId ?? '', inicio, fim),
    queryFn: async (): Promise<ConsumoCombustivel> => {
      const ateExclusivo = new Date(`${fim}T00:00:00`);
      ateExclusivo.setDate(ateExclusivo.getDate() + 1);

      const resultados = await Promise.all(
        ORIGENS.map(async ({ tipo, tabela }) => {
          const { data, error } = await supabase
            .from(tabela)
            .select('amount, cliente_id, devedor_cliente_id')
            .or(`cliente_id.eq.${clienteId},devedor_cliente_id.eq.${clienteId}`)
            .gte('transaction_date', new Date(`${inicio}T00:00:00`).toISOString())
            .lt('transaction_date', ateExclusivo.toISOString());
          if (error) throw error;
          const linhas = (data ?? []) as Array<{
            amount: number | null;
            cliente_id: string | null;
            devedor_cliente_id: string | null;
          }>;

          const aPagar = linhas.filter((l) => l.devedor_cliente_id === clienteId);
          const cobradoAOutro = linhas.filter(
            (l) => l.cliente_id === clienteId && l.devedor_cliente_id !== clienteId
          );
          const somar = (xs: typeof linhas) => xs.reduce((s, l) => s + (Number(l.amount) || 0), 0);

          return {
            tipo,
            soma: somar(aPagar),
            n: aPagar.length,
            cobradoAOutro: somar(cobradoAOutro),
          };
        })
      );

      return {
        total: resultados.reduce((s, r) => s + r.soma, 0),
        transacoes: resultados.reduce((s, r) => s + r.n, 0),
        gastoCobradoAOutro: resultados.reduce((s, r) => s + r.cobradoAOutro, 0),
        porTipo: {
          bp: resultados.find((r) => r.tipo === 'bp')?.soma ?? 0,
          repsol: resultados.find((r) => r.tipo === 'repsol')?.soma ?? 0,
          edp: resultados.find((r) => r.tipo === 'edp')?.soma ?? 0,
        },
      };
    },
    enabled: !!clienteId,
  });
}
