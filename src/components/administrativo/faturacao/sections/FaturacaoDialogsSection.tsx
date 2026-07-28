import { FaturacaoMovimentoDialog } from '../../FaturacaoMovimentoDialog';
import { RecibosDialog, type ReciboCobrancaAlvo } from '@/components/faturacao/RecibosDialog';
import {
  NotaCreditoDialog,
  type NotaCreditoCobranca,
} from '@/components/renting/contratos/NotaCreditoDialog';
import type { FaturacaoRow } from '../../faturacao';
import type { InvoiceMetadata } from '@/types/faturacao';
import type { FaturacaoDocEmitente } from '@/utils/faturacaoDocumento';

interface FaturacaoDialogsSectionProps {
  selectedRow: FaturacaoRow | null;
  invoice: InvoiceMetadata | null;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onFazerRecibo: (() => void) | undefined;
  onNotaCredito: (() => void) | undefined;
  /** Parcelar a fatura desta linha OU navegar para o acordo já existente (ver FaturacaoMovimentoDialog). */
  onParcelar: (() => void) | undefined;
  parcelarLabel: string | undefined;
  onAnular: (() => void) | undefined;

  /** Diálogo de Recibo */
  reciboOpen: boolean;
  onReciboOpenChange: (open: boolean) => void;
  actionOrgId: string;
  reciboAlvo: ReciboCobrancaAlvo | null;
  onReciboEmitido: () => void;

  /** Diálogo de Nota de Crédito */
  ncAlvo: NotaCreditoCobranca | null;
  onNcOpenChange: (open: boolean) => void;
  emitente: FaturacaoDocEmitente | null;
  ncJaCreditado: number;
  ncMotivo: string;
  onNcEmitida: () => void;

  /** Diálogo de Anulação */
  anularRow: FaturacaoRow | null;
  onAnularOpenChange: (open: boolean) => void;
}

/** Agrega todos os diálogos da faturação: detalhe, recibo, nota de crédito. */
export function FaturacaoDialogsSection({
  selectedRow,
  invoice,
  dialogOpen,
  onDialogOpenChange,
  onFazerRecibo,
  onNotaCredito,
  onParcelar,
  parcelarLabel,
  onAnular,
  reciboOpen,
  onReciboOpenChange,
  actionOrgId,
  reciboAlvo,
  onReciboEmitido,
  ncAlvo,
  onNcOpenChange,
  emitente,
  ncJaCreditado,
  ncMotivo,
  onNcEmitida,
  anularRow,
  onAnularOpenChange,
}: FaturacaoDialogsSectionProps) {
  return (
    <>
      <FaturacaoMovimentoDialog
        row={selectedRow}
        invoice={invoice}
        open={dialogOpen}
        onOpenChange={onDialogOpenChange}
        onFazerRecibo={onFazerRecibo}
        onNotaCredito={onNotaCredito}
        onParcelar={onParcelar}
        parcelarLabel={parcelarLabel}
        onAnular={onAnular}
      />

      <RecibosDialog
        open={reciboOpen}
        onOpenChange={onReciboOpenChange}
        orgId={actionOrgId}
        cobrancas={reciboAlvo ? [reciboAlvo] : []}
        preselectId={reciboAlvo?.id}
        onEmitido={onReciboEmitido}
      />

      <NotaCreditoDialog
        open={!!ncAlvo}
        onOpenChange={onNcOpenChange}
        cobranca={ncAlvo}
        orgId={actionOrgId}
        emitente={emitente}
        jaCreditado={ncJaCreditado}
        defaultMotivo={ncMotivo}
        onEmitida={onNcEmitida}
      />
    </>
  );
}
