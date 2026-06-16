import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Minus, Lock, Info, Download, Loader2, Receipt, FileMinus } from 'lucide-react';
import { formatCurrency, formatDateTime, formatDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { baixarDocumentoPdf } from '@/lib/keyinvoice';
import type { InvoiceMetadata } from '@/types/keyinvoice';
import { DOC_TIPO_LABEL, DOC_TIPO_CLASS, type FaturacaoRow } from './faturacao';

interface Props {
  row: FaturacaoRow | null;
  /** Documento fiscal KeyInvoice ligado a esta linha (quando existe). */
  invoice?: InvoiceMetadata | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ações sobre a fatura desta linha (quando é uma cobrança/fatura). */
  onFazerRecibo?: () => void;
  onNotaCredito?: () => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{value || '—'}</div>
    </div>
  );
}

export function FaturacaoMovimentoDialog({
  row,
  invoice,
  open,
  onOpenChange,
  onFazerRecibo,
  onNotaCredito,
}: Props) {
  const [downloading, setDownloading] = useState(false);
  const isCredito = row?.tipo === 'credito';
  const isFaturaRecibo = row?.docTipo === 'fatura_recibo';
  // Ações disponíveis quando a linha é uma fatura ligada a uma cobrança.
  const podeAgir = !!row?.cobrancaId && (row?.docTipo === 'fatura' || row?.docTipo === 'fatura_recibo');

  async function handleDownload() {
    if (!invoice) return;
    setDownloading(true);
    try {
      await baixarDocumentoPdf(invoice);
    } catch (e: any) {
      toast.error(`Erro ao obter PDF: ${e?.message ?? 'indisponível'}`);
    } finally {
      setDownloading(false);
    }
  }
  // Montante "principal": numa Fatura-Recibo é o valor recebido (crédito); nos restantes,
  // o débito ou o crédito conforme o tipo.
  const montante = row ? (row.credito ?? row.debito ?? row.valor) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Movimento de Conta-Corrente
            {row && (
              <Badge
                variant="secondary"
                className={cn('border-0 gap-1', DOC_TIPO_CLASS[row.docTipo] ?? '')}
              >
                {!isFaturaRecibo &&
                  (isCredito ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />)}
                {DOC_TIPO_LABEL[row.docTipo] ?? row.docTipo}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>Detalhe do movimento gerado a partir do contrato.</DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/40 px-3 py-3 text-center">
              <p className="text-xs text-muted-foreground">Montante</p>
              <p
                className={cn(
                  'text-2xl font-bold',
                  isCredito && !isFaturaRecibo
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-foreground'
                )}
              >
                {formatCurrency(montante)}
              </p>
              {isFaturaRecibo && (
                <p className="text-xs text-muted-foreground mt-1">
                  Fatura {formatCurrency(row.valor)} · Recibo {formatCurrency(row.credito ?? 0)} ·
                  liquidada
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Tipo de Documento"
                value={
                  <Badge
                    variant="secondary"
                    className={cn('border-0', DOC_TIPO_CLASS[row.docTipo] ?? '')}
                  >
                    {DOC_TIPO_LABEL[row.docTipo] ?? row.docTipo}
                  </Badge>
                }
              />
              <Field label="Método de Pagamento" value={row.metodoLabel} />
              <Field label="Entidade / Cliente" value={row.clienteNome} />
              <Field label="Contrato" value={row.contratoLabel} />
              <Field label="Nº Documento / Fatura" value={row.numeroDoc} />
              <Field label="Referência" value={row.referencia} />
              <Field label="Estação" value={row.estacaoNome} />
              <Field label="Utilizador" value={row.utilizador} />
              <Field label="Data Contabilística" value={formatDate(row.dataMovimento)} />
              <Field label="Registado em" value={formatDateTime(row.createdAt)} />
            </div>

            <Field label="Descritivo" value={row.descritivo} />

            {invoice ? (
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Documento fiscal KeyInvoice{invoice.numero ? `: ${invoice.numero}` : ''}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 shrink-0"
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  PDF
                </Button>
              </div>
            ) : row.numeroDoc !== '—' ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" /> Documento fiscal: {row.numeroDoc}
              </div>
            ) : null}

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground border-t pt-3">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Os movimentos de conta-corrente são um registo imutável (livro-razão). A faturação
              fiscal é emitida no KeyInvoice.
            </p>

            {podeAgir && (onFazerRecibo || onNotaCredito) && (
              <div className="flex flex-wrap gap-2 border-t pt-3">
                {onFazerRecibo && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={onFazerRecibo}
                  >
                    <Receipt className="h-4 w-4" /> Fazer recibo
                  </Button>
                )}
                {onNotaCredito && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-fuchsia-700 dark:text-fuchsia-300"
                    onClick={onNotaCredito}
                  >
                    <FileMinus className="h-4 w-4" /> Nota de crédito
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
