import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, CalendarPlus, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/utils/formatters';
import { useProlongarContrato } from '@/hooks/useContratosRenting';
import { useEmitirEEscreverFatura } from '@/hooks/useFaturacao';
import { carregarCobrancaParaEmitir, baixarDocumentoPdf } from '@/lib/faturacao';
import { calcularProlongamento } from '@/lib/prolongamentoContrato';
import type { ContratoRenting } from '@/types/contratoRenting';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato: ContratoRenting;
}

/** `2026-10-08T14:30:00Z` → `2026-10-08`, para o input date. */
const paraInputDate = (iso?: string | null): string => (iso ? iso.slice(0, 10) : '');

export function ProlongarContratoDialog({ open, onOpenChange, contrato }: Props) {
  const prolongarMut = useProlongarContrato();
  const emitirMut = useEmitirEEscreverFatura();

  const [novaDataStr, setNovaDataStr] = useState('');
  const [valorStr, setValorStr] = useState('');
  // O valor só se auto-preenche até o gestor lhe tocar: a partir daí é dele.
  const [valorTocado, setValorTocado] = useState(false);

  // 'pago' também conta como faturado: mais faturado do que pago não há, e os
  // totais estão igualmente congelados. 'anulado' fica de fora — aí a
  // faturação tem de ser refeita antes de se cobrar seja o que for.
  const jaFaturado =
    contrato.estado_financeiro === 'facturado' || contrato.estado_financeiro === 'pago';

  useEffect(() => {
    if (!open) return;
    setNovaDataStr('');
    setValorStr('');
    setValorTocado(false);
  }, [open]);

  const calc = useMemo(
    () =>
      calcularProlongamento(
        {
          data_inicio: contrato.data_inicio,
          data_fim: contrato.data_fim,
          valor_total_manual: contrato.valor_total_manual,
          tarifa_diaria: contrato.tarifa_diaria,
        },
        novaDataStr ? `${novaDataStr}T23:59:59Z` : null
      ),
    [contrato.data_inicio, contrato.data_fim, contrato.valor_total_manual, contrato.tarifa_diaria, novaDataStr]
  );

  // Proposta de valor, sempre que os dias mudam e o gestor ainda não escreveu.
  useEffect(() => {
    if (valorTocado) return;
    setValorStr(calc.valorSugerido != null ? calc.valorSugerido.toFixed(2) : '');
  }, [calc.valorSugerido, valorTocado]);

  const valor = Number(valorStr.replace(',', '.'));
  const valorValido = valorStr.trim() !== '' && Number.isFinite(valor) && valor >= 0;
  const podeConfirmar = calc.diasExtra > 0 && (!jaFaturado || valorValido);

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
  const codigoLabel = `#${String(contrato.codigo).padStart(4, '0')}`;

  async function handleProlongar() {
    try {
      // Fase 1 — registo (data + cobrança, na mesma transação do lado da BD).
      const cobrancaId = await prolongarMut.mutateAsync({
        contratoId: contrato.id,
        novaDataFim: `${novaDataStr}T23:59:59Z`,
        valorSemIva: jaFaturado ? valor : null,
      });

      if (!cobrancaId) {
        toast.success(`Contrato prolongado até ${formatDate(`${novaDataStr}T00:00:00Z`)}.`);
        onOpenChange(false);
        return;
      }

      // Fase 2 — emissão fiscal. NUNCA reverte a fase 1: se falhar, a cobrança
      // fica com o badge "Por emitir" e o botão Reemitir no separador Faturação,
      // como já acontece na faturação normal.
      //
      // O destinatário e a taxa saem da cobrança que a RPC acabou de criar (ela
      // é que sabe qual foi a última cobrança viva do contrato), em vez de
      // serem recalculados aqui — assim o documento fiscal e o registo
      // contabilístico não podem divergir.
      try {
        const { cobranca, cliente } = await carregarCobrancaParaEmitir(cobrancaId);

        const res = await emitirMut.mutateAsync({
          payload: {
            tipo: 'FT',
            cliente,
            // Uma linha só: o prolongamento. Rent-a-car tem o preço SEM IVA, e
            // o emissor soma a taxa por cima — envia-se tal e qual.
            itens: [
              {
                descricao: cobranca.descricao ?? 'Prolongamento de contrato',
                quantidade: 1,
                preco_unitario: Number(cobranca.valor_sem_iva),
                taxa_iva: Number(cobranca.taxa_iva),
                desconto: 0,
              },
            ],
            contrato_id: contrato.id,
            cobranca_id: cobrancaId,
            referencia_externa: `Contrato ${codigoLabel} — prolongamento`,
          },
          cobrancaId,
          contratoId: contrato.id,
        });
        if (res.invoice) {
          try {
            await baixarDocumentoPdf(res.invoice);
          } catch (pdfErr) {
            console.error('Documento emitido mas falhou o download do PDF:', pdfErr);
          }
        }
        toast.success(
          `Contrato prolongado e fatura emitida${res.fullDocNumber ? ` (${res.fullDocNumber})` : ''}.`
        );
        if (res.warning) toast.warning(res.warning);
      } catch (erroEmissao) {
        console.error('Falha a emitir o documento fiscal do prolongamento:', erroEmissao);
        toast.warning(
          'Contrato prolongado e fatura registada, mas o documento fiscal ficou por emitir. Podes reemiti-lo no separador Faturação.'
        );
      }
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = (e as { message?: string } | null)?.message ?? 'tente novamente';
      toast.error(`Não foi possível prolongar: ${msg}`);
    }
  }

  const ocupado = prolongarMut.isPending || emitirMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => (ocupado ? undefined : onOpenChange(o))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" /> Prolongar contrato {codigoLabel}
          </DialogTitle>
          <DialogDescription>
            Estica a data de fim deste contrato. O código e o contrato mantêm-se — só ganha mais
            dias.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1 text-sm">
          <div className="rounded-md border divide-y">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-muted-foreground text-xs">Período atual</span>
              <span className="tabular-nums">
                {formatDate(contrato.data_inicio)} →{' '}
                {contrato.data_fim ? formatDate(contrato.data_fim) : '—'}
              </span>
            </div>
            {calc.diasExtra > 0 && (
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-muted-foreground text-xs">Dias a mais</span>
                <span className="tabular-nums font-medium">
                  {calc.diasExtra} dia{calc.diasExtra === 1 ? '' : 's'}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="prolongar-data" className="text-xs text-muted-foreground">
              Nova data de fim *
            </Label>
            <Input
              id="prolongar-data"
              type="date"
              value={novaDataStr}
              min={paraInputDate(contrato.data_fim)}
              onChange={(e) => setNovaDataStr(e.target.value)}
              className="bg-background"
            />
            {novaDataStr && calc.diasExtra === 0 && (
              <p className="text-xs text-destructive">
                A nova data tem de ser posterior ao fim atual.
              </p>
            )}
          </div>

          {jaFaturado ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
              <Label htmlFor="prolongar-valor" className="text-xs text-muted-foreground">
                Valor a faturar, sem IVA *
              </Label>
              <Input
                id="prolongar-valor"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={valorStr}
                onChange={(e) => {
                  setValorTocado(true);
                  setValorStr(e.target.value);
                }}
                placeholder="0.00"
                className="bg-background tabular-nums"
              />
              {calc.diaria != null && calc.diasExtra > 0 && (
                <p className="text-xs text-muted-foreground">
                  Sugestão: {calc.diasExtra} × {fmt(calc.diaria)} (diária do contrato) ={' '}
                  {fmt(calc.valorSugerido ?? 0)}. Podes corrigir antes de emitir.
                </p>
              )}
              {calc.diaria == null && calc.diasExtra > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  O contrato não tem valor acordado nem tarifa diária — escreve o valor à mão.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Sai uma fatura nova só destes dias. A do período original não se toca — está
                congelada por compliance.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs">
                Este contrato ainda <strong>não está faturado</strong>, por isso não sai fatura
                nenhuma agora — só se estica a data. Quando o faturares, o total já conta o período
                todo, incluindo estes dias.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={ocupado}>
            Cancelar
          </Button>
          <Button onClick={handleProlongar} disabled={ocupado || !podeConfirmar}>
            {ocupado ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CalendarPlus className="h-4 w-4 mr-2" />
            )}
            {jaFaturado ? 'Prolongar e faturar' : 'Prolongar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
