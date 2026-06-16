import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, FileMinus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/formatters';
import { openFaturacaoDocumento, type FaturacaoDocEmitente } from '@/utils/faturacaoDocumento';
import { emitirDocumento, baixarDocumentoPdf, clienteRowToKI } from '@/lib/keyinvoice';

/** Cobrança/fatura-alvo da nota de crédito. */
export interface NotaCreditoCobranca {
  id: string;
  descricao: string | null;
  valor_total: number | null;
  taxa_iva: number | null;
  destinatario_id: string;
  destinatario_nome: string;
  contrato_id: string | null;
  documento_externo_ref: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cobranca: NotaCreditoCobranca | null;
  orgId: string;
  emitente?: FaturacaoDocEmitente | null;
  /** Total já creditado por NC ativas desta cobrança (para o saldo disponível). */
  jaCreditado?: number;
  onEmitida: () => void;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const hojeISO = () => new Date().toISOString().slice(0, 10);

export function NotaCreditoDialog({
  open,
  onOpenChange,
  cobranca,
  orgId,
  emitente,
  jaCreditado = 0,
  onEmitida,
}: Props) {
  const qc = useQueryClient();
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalCobranca = round2(cobranca?.valor_total ?? 0);
  const saldoDisponivel = round2(Math.max(0, totalCobranca - jaCreditado));
  const taxaIva = cobranca?.taxa_iva ?? 23;
  const docOriginal =
    cobranca?.documento_externo_ref || (cobranca ? cobranca.id.slice(0, 8).toUpperCase() : '—');

  // Ao abrir, propõe o saldo disponível como valor por defeito.
  useEffect(() => {
    if (open) {
      setValor(saldoDisponivel > 0 ? String(saldoDisponivel) : '');
      setMotivo('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cobranca?.id]);

  const valorNum = round2(parseFloat(valor.replace(',', '.')) || 0);
  const saldoRestante = round2(saldoDisponivel - valorNum);
  const excede = valorNum > saldoDisponivel + 0.005;
  const creditaTudo = valorNum > 0 && !excede && saldoRestante <= 0.005;

  const erro = useMemo(() => {
    if (!cobranca) return 'Sem cobrança selecionada.';
    if (saldoDisponivel <= 0) return 'Esta cobrança já está totalmente creditada.';
    if (valorNum <= 0) return 'Indique um valor a creditar.';
    if (valorNum > saldoDisponivel + 0.005)
      return `O valor excede o saldo por creditar (${formatCurrency(saldoDisponivel)}).`;
    if (!motivo.trim()) return 'A justificação é obrigatória.';
    return null;
  }, [cobranca, saldoDisponivel, valorNum, motivo]);

  async function handleEmitir() {
    if (!cobranca || erro) {
      if (erro) toast.error(erro);
      return;
    }
    setSubmitting(true);
    try {
      // ── Fase 1 — registar a nota de crédito (trigger posta o crédito) ────
      // contrato_id é preenchido pelo trigger a partir da cobrança (pode ser uma
      // cobrança de reserva, sem contrato) — por isso não o enviamos aqui.
      const { data: inserida, error } = await supabase
        .from('notas_credito')
        .insert({
          org_id: orgId,
          cobranca_id: cobranca.id,
          entidade_id: cobranca.destinatario_id,
          valor: valorNum,
          motivo: motivo.trim(),
          data_nota: hojeISO(),
        })
        .select('id, codigo')
        .single();
      if (error) throw error;

      const codigo = inserida?.codigo;
      const numero = codigo != null ? `NC-${codigo}` : 'Nota de Crédito';

      qc.invalidateQueries({ queryKey: ['renting'] });
      qc.invalidateQueries({ queryKey: ['contrato-cobrancas', cobranca.contrato_id] });
      qc.invalidateQueries({ queryKey: ['contrato-notas-credito', cobranca.contrato_id] });

      // Dados do cliente para o cabeçalho (best-effort).
      const { data: cli } = await supabase
        .from('clientes')
        .select('nome, nif, email, morada, codigo_postal, localidade, cidade')
        .eq('id', cobranca.destinatario_id)
        .maybeSingle();

      const base = round2(valorNum / (1 + taxaIva / 100));
      const iva = round2(valorNum - base);

      // ── Fase 2 — emitir a NC no KeyInvoice se a fatura original também o for ─
      let emitiuKI = false;
      if (cobranca.documento_externo_ref) {
        try {
          const res = await emitirDocumento({
            tipo: 'NC',
            cliente: clienteRowToKI(cli, cobranca.destinatario_nome),
            itens: [
              {
                descricao: `Crédito sobre ${docOriginal} — ${motivo.trim()}`,
                quantidade: 1,
                preco_unitario: base,
                taxa_iva: taxaIva,
              },
            ],
            contrato_id: cobranca.contrato_id,
            cobranca_id: cobranca.id,
            documento_referencia: cobranca.documento_externo_ref,
            referencia_externa: numero,
            observacoes: motivo.trim(),
          });
          if (res.invoice) {
            try {
              await baixarDocumentoPdf(res.invoice);
            } catch {
              /* download é best-effort */
            }
          }
          emitiuKI = true;
          toast.success(
            `Nota de crédito ${res.keyinvoice?.FullDocNumber ?? numero} emitida no KeyInvoice (${formatCurrency(valorNum)}).`
          );
          if (res.warning) toast.warning(res.warning);
          qc.invalidateQueries({ queryKey: ['invoices-by-contrato', cobranca.contrato_id] });
        } catch (kiErr: any) {
          console.error('Falha a emitir NC no KeyInvoice:', kiErr);
          toast.warning(
            'Nota de crédito registada, mas não foi possível emitir no KeyInvoice — foi gerado o documento interno.'
          );
        }
      }

      // Documento HTML local (fallback) — original não-KeyInvoice ou emissão falhada.
      if (!emitiuKI) {
        const clienteMorada =
          [cli?.morada, cli?.codigo_postal, cli?.cidade].filter(Boolean).join(', ') || null;
        const aberto = openFaturacaoDocumento({
          tipo: 'nota_credito',
          numero,
          data: hojeISO(),
          emitente: emitente ?? null,
          cliente: { nome: cobranca.destinatario_nome, nif: cli?.nif ?? null, morada: clienteMorada },
          linhas: [{ descricao: `Crédito sobre ${docOriginal} — ${motivo.trim()}`, valor: base }],
          subtotal: base,
          taxaIva,
          iva,
          total: valorNum,
          motivo: motivo.trim(),
          documentoOriginal: docOriginal,
          valorOriginal: totalCobranca,
          saldoRestante,
        });
        toast.success(`Nota de crédito ${numero} emitida (${formatCurrency(valorNum)}).`);
        if (!aberto) toast.warning('Pop-up bloqueado — não foi possível abrir o documento.');
      }

      onEmitida();
      onOpenChange(false);
    } catch (e: any) {
      console.error('Erro ao emitir nota de crédito:', e);
      toast.error(`Erro ao emitir nota de crédito: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileMinus className="h-5 w-5 text-fuchsia-600 dark:text-fuchsia-400" />
            Emitir Nota de Crédito
          </DialogTitle>
          <DialogDescription>
            Credita (total ou parcialmente) a fatura {docOriginal}. A fatura original mantém-se; a
            nota de crédito abate-a.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo da cobrança */}
          <div className="rounded-md border divide-y text-sm">
            <Linha label="Documento" value={docOriginal} />
            <Linha label="Total da fatura" value={formatCurrency(totalCobranca)} />
            {jaCreditado > 0 && (
              <Linha label="Já creditado" value={`− ${formatCurrency(jaCreditado)}`} muted />
            )}
            <Linha label="Saldo por creditar" value={formatCurrency(saldoDisponivel)} strong />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Valor a creditar</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              max={saldoDisponivel}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              disabled={saldoDisponivel <= 0}
              className="h-9"
            />
            {excede ? (
              <p className="text-[11px] text-destructive">
                O valor excede o saldo por creditar ({formatCurrency(saldoDisponivel)}).
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Máximo {formatCurrency(saldoDisponivel)} (IVA {taxaIva}% incluído).
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Justificação</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo da nota de crédito (obrigatório)…"
              rows={3}
            />
          </div>

          {/* Diferença / saldo restante */}
          <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2.5">
            <span className="text-sm text-muted-foreground">Saldo restante após esta nota</span>
            <span
              className={cn(
                'text-base font-bold tabular-nums',
                creditaTudo && 'text-emerald-600 dark:text-emerald-400'
              )}
            >
              {formatCurrency(Math.max(0, saldoRestante))}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleEmitir}
            disabled={submitting || !!erro}
            className="gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Emitir nota de crédito
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Linha({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={cn('tabular-nums', strong && 'font-semibold', muted && 'text-muted-foreground')}
      >
        {value}
      </span>
    </div>
  );
}
