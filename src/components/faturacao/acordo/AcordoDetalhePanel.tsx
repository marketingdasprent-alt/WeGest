// src/components/faturacao/acordo/AcordoDetalhePanel.tsx
import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAcordoDetalhe } from '@/hooks/useAcordoDetalhe';
import { AcordoStatusBadge } from '@/components/faturacao/AcordoStatusBadge';
import { ParcelaTimelineItem } from './ParcelaTimelineItem';
import { RegistarPagamentoDialog } from './RegistarPagamentoDialog';
import { DocumentoPreviewDialog } from './DocumentoPreviewDialog';
import { formatCurrency } from '@/utils/formatters';
import type { ParcelaDetalhe } from '@/hooks/useAcordoDetalhe';

interface Props {
  acordoId: string;
}

export function AcordoDetalhePanel({ acordoId }: Props) {
  const { data: acordo, isLoading, error } = useAcordoDetalhe(acordoId);
  const [parcelaAlvo, setParcelaAlvo] = useState<ParcelaDetalhe | null>(null);
  const [invoiceIdPreview, setInvoiceIdPreview] = useState<string | null>(null);

  const resumo = useMemo(() => {
    if (!acordo) return null;
    const pagas = acordo.parcelas.filter((p) => p.estado === 'paga').length;
    const total = acordo.parcelas.length;
    // faltaPagar vem do hook (RPC cobranca_saldo_por_liquidar) — NUNCA recalcular
    // aqui a partir da soma das parcelas, que pode divergir do saldo real.
    const faltaPagar = acordo.faltaPagar;
    const proxima = acordo.parcelas.find((p) => p.estado === 'agendada' || p.estado === 'avisada');
    return { pagas, total, faltaPagar, proximaData: proxima?.dataVencimento ?? null };
  }, [acordo]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !acordo || !resumo) {
    return (
      <div className="py-16 text-center text-sm text-destructive">
        {error ? `Erro: ${(error as Error).message}` : 'Acordo não encontrado.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">FALTA PAGAR</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(resumo.faltaPagar)}
            </p>
          </div>
          <AcordoStatusBadge estado={acordo.estado} />
        </div>
        <p className="text-sm text-muted-foreground">
          {resumo.pagas} de {resumo.total} parcelas pagas
          {resumo.proximaData
            ? ` · próxima em ${resumo.proximaData.split('-').reverse().join('/')}`
            : ''}
        </p>
        <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Responsável</p>
            <p>{acordo.responsavelNome}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Titular fiscal</p>
            <p>
              {acordo.titularNome}
              {acordo.titularNif ? ` · NIF ${acordo.titularNif}` : ''}
            </p>
          </div>
        </div>
      </div>

      <ol className="relative ml-3 space-y-5 border-l border-border/60">
        {acordo.parcelas.map((parcela) => (
          <ParcelaTimelineItem
            key={parcela.id}
            acordo={acordo}
            parcela={parcela}
            onRegistarPagamento={setParcelaAlvo}
            onVerDocumento={setInvoiceIdPreview}
          />
        ))}
      </ol>

      <RegistarPagamentoDialog
        open={!!parcelaAlvo}
        onOpenChange={(o) => {
          if (!o) setParcelaAlvo(null);
        }}
        acordo={acordo}
        parcela={parcelaAlvo}
      />

      <DocumentoPreviewDialog
        open={!!invoiceIdPreview}
        onOpenChange={(o) => {
          if (!o) setInvoiceIdPreview(null);
        }}
        invoiceId={invoiceIdPreview}
      />
    </div>
  );
}
