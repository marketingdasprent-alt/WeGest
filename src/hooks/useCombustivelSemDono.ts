import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

import { supabase } from '@/integrations/supabase/client';
import {
  agruparSemDono,
  type FonteCombustivel,
  type TransacaoSemDono,
} from '@/utils/combustivelSemDono';

interface Linha {
  amount: number | null;
  transaction_id: string;
  card_number?: string | null;
  raw_data?: Record<string, unknown> | null;
  bp_cartoes?: { card_number: string | null } | null;
}

/**
 * Combustível da semana que ninguém paga: gravado sem motorista nem cliente.
 * Foi assim que a EDP e a BP passaram semanas sem desconto sem ninguém ver.
 */
export function useCombustivelSemDono(inicio: Date, fim: Date, enabled = true) {
  const de = format(inicio, 'yyyy-MM-dd');
  const ate = format(fim, 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['combustivel-sem-dono', { de, ate }],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // A hora da bomba é local gravada como UTC: o dia inteiro é T00:00Z–T23:59Z.
      const daSemana = (tabela: string, colunas: string) =>
        supabase
          .from(tabela as 'repsol_transacoes')
          .select(colunas)
          .gte('transaction_date', `${de}T00:00:00Z`)
          .lte('transaction_date', `${ate}T23:59:59Z`)
          .is('motorista_id', null)
          .is('cliente_id', null)
          .gt('amount', 0);

      const [repsol, edp, bp] = await Promise.all([
        daSemana('repsol_transacoes', 'amount, transaction_id, card_number'),
        daSemana('edp_transacoes', 'amount, transaction_id, card_number'),
        daSemana('bp_transacoes', 'amount, transaction_id, raw_data, bp_cartoes(card_number)'),
      ]);
      for (const r of [repsol, edp, bp]) if (r.error) throw r.error;

      const linhas = (fonte: FonteCombustivel, dados: unknown): TransacaoSemDono[] =>
        ((dados ?? []) as Linha[]).map((l) => ({
          fonte,
          valor: Number(l.amount) || 0,
          cardNumber: l.card_number ?? l.bp_cartoes?.card_number ?? null,
          transactionId: l.transaction_id,
          numeroNoFicheiro: (l.raw_data?.['Nº cartão'] as string | undefined) ?? null,
        }));

      return agruparSemDono([
        ...linhas('repsol', repsol.data),
        ...linhas('edp', edp.data),
        ...linhas('bp', bp.data),
      ]);
    },
  });
}
