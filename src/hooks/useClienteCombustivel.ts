/**
 * Combustível de um cliente: os cartões que tem e o que gastaram no período.
 *
 * É o espelho do que `motorista_extrato_periodo` faz para o motorista — uma
 * SOMA ao vivo das três tabelas de transacções, não um lançamento. Nada disto
 * entra em `conta_movimentos`: essa é a conta-corrente, alimentada por
 * cobranças e recibos, e pôr combustível lá dentro é gerar dívida ao cliente e
 * documento fiscal a seguir. Enquanto essa decisão não for tomada, o consumo
 * mostra-se, não se cobra.
 *
 * QUEM GASTOU vs QUEM PAGA
 * O gatilho carimba dois campos a partir de `cartao_atribuicoes` (quem tinha o
 * cartão naquele dia) e do contrato:
 *   `cliente_id`         — quem gastou
 *   `devedor_cliente_id` — quem paga: o titular do contrato rent-a-car onde o
 *                          condutor está vigente, ou ele próprio se não houver.
 * Quando o condutor é o titular, os dois coincidem. Quando conduz sob contrato
 * de outro, o gasto é dele e a conta é do titular.
 *
 * Como ambos derivam de `cartao_atribuicoes`, o total responde a correcções
 * retroactivas: corrigir quem tinha o cartão re-imputa o passado sozinho.
 *
 * RLS: as três tabelas exigem `can_view_financeiro()`. Quem não o tiver recebe
 * listas vazias em vez de erro — é o mesmo gate do extrato do motorista.
 */
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
  /**
   * O que ESTE cliente tem a pagar no período — a soma das transacções cujo
   * devedor é ele. É este o número que vai à conta-corrente.
   *
   * Inclui o que outros condutores gastaram sob contrato dele (é ele o titular)
   * e exclui o que ele gastou sob contrato de outro.
   */
  total: number;
  /** Quantas transacções entraram no total — distingue "zero" de "sem dados". */
  transacoes: number;
  porTipo: Record<'bp' | 'repsol' | 'edp', number>;
  /**
   * O que ele gastou com os cartões dele mas é cobrado a outro — porque conduz
   * sob contrato alheio. Zero na esmagadora maioria dos casos; quando não é,
   * a diferença entre "gastou" e "paga" tem de estar à vista, senão o número
   * parece simplesmente errado a quem o lê.
   */
  gastoCobradoAOutro: number;
}

export const clienteCartoesKey = (clienteId: string) =>
  ['cliente-combustivel', 'cartoes', clienteId] as const;

export const clienteConsumoKey = (clienteId: string, inicio: string, fim: string) =>
  ['cliente-combustivel', 'consumo', clienteId, inicio, fim] as const;

/** Cartões de frota actualmente atribuídos a este cliente. */
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

/**
 * Consumo do cliente entre duas datas (inclusive).
 *
 * Três queries e não uma: as tabelas são separadas por fornecedor e não há
 * vista que as una. É o mesmo `UNION ALL` que `motorista_extrato_periodo` faz
 * do lado do servidor.
 */
export function useConsumoDoCliente(clienteId: string | null, inicio: string, fim: string) {
  return useQuery({
    queryKey: clienteConsumoKey(clienteId ?? '', inicio, fim),
    queryFn: async (): Promise<ConsumoCombustivel> => {
      // `fim` é inclusivo para quem lê; a coluna é timestamptz, por isso o
      // corte é no início do dia seguinte.
      const ateExclusivo = new Date(`${fim}T00:00:00`);
      ateExclusivo.setDate(ateExclusivo.getDate() + 1);

      // Trazemos as linhas em que ele é QUALQUER um dos dois lados e separamos
      // aqui. Duas queries por tabela dariam seis idas à base para responder a
      // uma pergunta só, e o volume por cliente e período é pequeno.
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
