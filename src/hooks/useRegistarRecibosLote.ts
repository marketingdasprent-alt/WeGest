import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrgId } from '@/contexts/TenantContext';
import { carregarFaturasPorLiquidar } from '@/hooks/useFaturasPorLiquidar';
import { registarRecibosEmLote, type DadosPagamento, type ResultadoRecibo } from '@/lib/recibos';

export interface RegistarRecibosLoteInput {
  cobrancaIds: string[];
  pagamento: Omit<DadosPagamento, 'valor'>;
  onProgresso?: (feitos: number, total: number) => void;
}

export interface ResultadoLote {
  resultados: ResultadoRecibo[];
  /** Escolhidas mas que entretanto deixaram de estar por pagar (outra pessoa fez o recibo). */
  jaPagas: number;
}

export function useRegistarRecibosLote() {
  const qc = useQueryClient();
  const orgId = useOrgId();

  return useMutation({
    mutationFn: async ({
      cobrancaIds,
      pagamento,
      onProgresso,
    }: RegistarRecibosLoteInput): Promise<ResultadoLote> => {
      if (!orgId) throw new Error('Organização não identificada.');
      // Saldo relido agora: a lista no ecrã pode estar velha e pagar duas vezes a mesma fatura.
      const frescas = [];
      for (let i = 0; i < cobrancaIds.length; i += 100) {
        frescas.push(
          ...(await carregarFaturasPorLiquidar({
            de: '',
            ate: '',
            ids: cobrancaIds.slice(i, i + 100),
          }))
        );
      }
      const aindaEmAberto = new Set(frescas.map((f) => f.id));
      const resultados = await registarRecibosEmLote(orgId, frescas, pagamento, onProgresso);
      return { resultados, jaPagas: cobrancaIds.filter((id) => !aindaEmAberto.has(id)).length };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['faturas-por-liquidar'] });
      qc.invalidateQueries({ queryKey: ['contas-a-receber'] });
      qc.invalidateQueries({ queryKey: ['renting'] });
      qc.invalidateQueries({ queryKey: ['contrato-cobrancas'] });
      qc.invalidateQueries({ queryKey: ['reserva-cobrancas'] });
    },
  });
}
