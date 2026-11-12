import { toast } from 'sonner';
import { formatCurrency } from '@/utils/formatters';
import type { EmitResult } from '@/types/faturacao';

type CamposTotal = Pick<EmitResult, 'totalDivergente' | 'totalNaoConfirmado'>;

/** Textos dos avisos de total da edge; vazio quando o total bateu certo. */
export function mensagensTotalEmissao(res: CamposTotal): string[] {
  const msgs: string[] = [];
  const d = res.totalDivergente;
  if (d) {
    msgs.push(
      `Fatura ${d.numero} emitida com total ${formatCurrency(d.real)} em vez de ${formatCurrency(d.esperado)}. ` +
        'A emissão de faturas desta integração foi travada.'
    );
  }
  if (res.totalNaoConfirmado) {
    msgs.push(
      'Total da fatura não confirmado na KeyInvoice; confirme o documento antes de emitir mais.'
    );
  }
  return msgs;
}

/** Toast que não desaparece sozinho: o documento já existe no fornecedor e alguém tem de o ver. */
export function avisarTotalDaEmissao(res: CamposTotal): void {
  // Ids estáveis: o sonner deduplica se o mesmo aviso chegar duas vezes.
  const opcoes = { duration: Infinity, closeButton: true };
  const d = res.totalDivergente;
  if (d) {
    toast.error(mensagensTotalEmissao({ totalDivergente: d })[0], {
      ...opcoes,
      id: `total-${d.numero}`,
    });
  }
  if (res.totalNaoConfirmado) {
    toast.error(mensagensTotalEmissao({ totalNaoConfirmado: true })[0], {
      ...opcoes,
      id: 'total-nao-confirmado',
    });
  }
}
