// src/components/faturacao/acordo/AcordoDetalhePanel.tsx
import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAcordoDetalhe } from '@/hooks/useAcordoDetalhe';
import { useAcordoVistaDevedor } from '@/hooks/useAcordoVistaDevedor';
import { AcordoStatusBadge, type AcordoEstado } from '@/components/faturacao/AcordoStatusBadge';
import { ParcelaTimelineItem } from './ParcelaTimelineItem';
import { RegistarPagamentoDialog } from './RegistarPagamentoDialog';
import { DocumentoPreviewDialog } from './DocumentoPreviewDialog';
import { formatCurrency } from '@/utils/formatters';
import { metodoLabel } from '@/components/administrativo/faturacao';
import type { ParcelaDetalhe } from '@/hooks/useAcordoDetalhe';

interface Props {
  acordoId: string;
  /**
   * 'staff' (default) usa useAcordoDetalhe (vista interna completa, RLS de staff) —
   * comportamento inalterado desde a 4B, usado na rota /acordos/:id. 'devedor' usa
   * useAcordoVistaDevedor (RPC acordo_vista_devedor, SECURITY DEFINER, campos já
   * reduzidos do lado do servidor: sem titular_nif, sem estado de outbox/API) e
   * esconde toda a acção interna (Registar pagamento, Ver recibo, PDF do aviso,
   * reconciliação de suspenso) e qualquer referência ao titular fiscal.
   */
  modo?: 'staff' | 'devedor';
}

export function AcordoDetalhePanel({ acordoId, modo = 'staff' }: Props) {
  const modoStaff = modo !== 'devedor';
  // Cada hook só corre com o id quando é o modo activo — o outro recebe undefined e
  // fica sem RPC/query a disparar (ver comentário em useAcordoVistaDevedor.ts sobre
  // não usar `enabled`: aqui o "desligar" é feito ao nível do argumento, não da opção
  // enabled do useQuery, por isso continua seguro mesmo com essa mudança).
  const staffQuery = useAcordoDetalhe(modoStaff ? acordoId : undefined);
  const devedorQuery = useAcordoVistaDevedor(modoStaff ? undefined : acordoId);
  const acordoStaff = modoStaff ? staffQuery.data : undefined;
  const acordoDevedor = modoStaff ? undefined : devedorQuery.data;
  const acordo = acordoStaff ?? acordoDevedor;
  const isLoading = modoStaff ? staffQuery.isLoading : devedorQuery.isLoading;
  const error = modoStaff ? staffQuery.error : devedorQuery.error;
  const [parcelaAlvo, setParcelaAlvo] = useState<ParcelaDetalhe | null>(null);
  const [invoiceIdPreview, setInvoiceIdPreview] = useState<string | null>(null);
  // Janela do preview: aberta SINCRONAMENTE no clique (ParcelaTimelineItem), nunca
  // aqui — ver comentário em DocumentoPreviewDialog.tsx sobre o popup-blocker.
  const [previewWindow, setPreviewWindow] = useState<Window | null>(null);

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
          <AcordoStatusBadge estado={acordo.estado as AcordoEstado} />
        </div>
        <p className="text-sm text-muted-foreground">
          {resumo.pagas} de {resumo.total} parcelas pagas
          {resumo.proximaData
            ? ` · próxima em ${resumo.proximaData.split('-').reverse().join('/')}`
            : ''}
        </p>
        {/* Responsável/titular fiscal: só em modo staff — a vista do devedor
            (AcordoVistaDevedor) nem sequer traz estes campos (nunca expõe NIF). */}
        {modoStaff && acordoStaff && (
          <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Responsável</p>
              <p>{acordoStaff.responsavelNome}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Titular fiscal</p>
              <p>
                {acordoStaff.titularNome}
                {acordoStaff.titularNif ? ` · NIF ${acordoStaff.titularNif}` : ''}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Recibos emitidos por fora do parcelamento (ex.: Fatura → Emitir Recibo) já
          contam para FALTA PAGAR acima, mas nenhuma parcela sabe deles — sem este
          aviso não há como perceber, olhando só para a timeline, porque uma parcela
          mostra o valor nominal inteiro quando na verdade já falta menos (achado ao
          testar manualmente). Só em modo staff, mesmo critério de RegistarPagamentoDialog
          e das restantes acções internas. */}
      {modoStaff && acordoStaff && acordoStaff.recibosExternos.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-1.5">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Recibo(s) emitido(s) fora deste acordo — já contam para "falta pagar"
          </p>
          {acordoStaff.recibosExternos.map((r) => (
            <p key={r.id} className="text-xs text-muted-foreground">
              Recibo nº {r.codigo} · {formatCurrency(r.valor)} ·{' '}
              {r.dataRecibo.split('-').reverse().join('/')} · {metodoLabel(r.metodo)}
            </p>
          ))}
        </div>
      )}

      <ol className="relative ml-3 space-y-5 border-l border-border/60">
        {acordo.parcelas.map((parcela) => (
          <ParcelaTimelineItem
            key={parcela.numero}
            acordo={acordo}
            parcela={parcela}
            modo={modo}
            onRegistarPagamento={setParcelaAlvo}
            onVerDocumento={(invoiceId, win) => {
              // Fecha a janela anterior se o utilizador clicar 2x seguidas antes do
              // primeiro preview resolver — sem isto, a 2ª janela nunca é referenciada
              // de novo (o efeito do dialog está keyed em [open, invoiceId], que não
              // muda) e fica órfã, permanentemente em branco.
              setPreviewWindow((prev) => {
                prev?.close();
                return win;
              });
              setInvoiceIdPreview(invoiceId);
            }}
          />
        ))}
      </ol>

      {/* Diálogos de acção (registar pagamento / ver recibo): só existem em modo
          staff. Em modo devedor nunca abrem — o ParcelaTimelineItem já esconde os
          botões que os disparariam — mas nem sequer os montamos, para não termos de
          fingir um `acordo: AcordoDetalhe` completo a partir da vista reduzida. */}
      {modoStaff && acordoStaff && (
        <>
          <RegistarPagamentoDialog
            open={!!parcelaAlvo}
            onOpenChange={(o) => {
              if (!o) setParcelaAlvo(null);
            }}
            acordo={acordoStaff}
            parcela={parcelaAlvo}
          />

          <DocumentoPreviewDialog
            open={!!invoiceIdPreview}
            onOpenChange={(o) => {
              if (!o) {
                setInvoiceIdPreview(null);
                setPreviewWindow(null);
              }
            }}
            invoiceId={invoiceIdPreview}
            previewWindow={previewWindow}
          />
        </>
      )}
    </div>
  );
}
