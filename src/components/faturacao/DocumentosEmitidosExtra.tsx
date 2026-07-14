/**
 * Lista os documentos de Nota de Crédito (NC) e Recibo (RC) já emitidos com PDF,
 * cada um com download e envio por email. Complementa a tabela de faturas (FT/FR)
 * da aba Faturar do contrato/reserva — esses documentos são emitidos noutros
 * diálogos e não apareciam aqui com ações de PDF.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, Mail, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { baixarDocumentoPdf } from '@/lib/faturacao';
import { tipoDocumentoLabel } from '@/lib/documentoEmail';
import type { InvoiceMetadata } from '@/types/faturacao';

interface Props {
  invoices: InvoiceMetadata[];
  onEnviar: (inv: InvoiceMetadata) => void;
}

export function DocumentosEmitidosExtra({ invoices, onEnviar }: Props) {
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  const docs = invoices
    .filter(
      (inv) =>
        (inv.tipo === 'NC' || inv.tipo === 'RC') &&
        inv.status === 'emitida' &&
        !!inv.provider_docnum
    )
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

  if (docs.length === 0) return null;

  async function baixar(inv: InvoiceMetadata) {
    setBaixandoId(inv.id);
    try {
      await baixarDocumentoPdf(inv);
    } catch (e: any) {
      toast.error(`Erro ao obter PDF: ${e?.message ?? 'indisponível'}`);
    } finally {
      setBaixandoId(null);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5" /> Notas de crédito e recibos
      </p>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-xs">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="font-sans">
                      {tipoDocumentoLabel(inv.tipo)}
                    </Badge>
                    <span>{inv.numero ?? inv.provider_docnum}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(inv.total)}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatDate(inv.data_emissao ?? inv.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Descarregar PDF"
                      onClick={() => baixar(inv)}
                      disabled={baixandoId === inv.id}
                    >
                      {baixandoId === inv.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Enviar por email"
                      onClick={() => onEnviar(inv)}
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
