/**
 * Diálogo "Fazer recibo" — regista um pagamento (liquidação) sobre uma
 * fatura/cobrança em aberto. O recibo gera um crédito na conta-corrente
 * (trigger fn_recibo_posta_movimento); se liquidar o saldo todo, a cobrança
 * passa a 'paga'. O Recibo (RC) fiscal é emitido primeiro — ver registarRecibo.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Receipt } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/formatters';
import { METODO_OPTIONS } from '@/components/administrativo/faturacao';
import { baixarDocumentoPdf } from '@/lib/faturacao';
import { DURACAO_AVISO_FALHA_MS } from '@/lib/faturacaoFalha';
import { registarRecibo } from '@/lib/recibos';
import { ErroRecibo, explicarErroRecibo, type ErroReciboExplicado } from '@/lib/reciboErro';
import { ErroReciboAviso } from '@/components/faturacao/ErroReciboAviso';

/** Cobrança/fatura em aberto que um recibo pode liquidar. */
export interface ReciboCobrancaAlvo {
  id: string;
  descricao: string | null;
  valor_total: number | null;
  /** Valor por liquidar (valor_total − recibos ativos − NC ativas), pré-computado. */
  saldoPagar: number;
  destinatario_id: string;
  destinatario_nome: string;
  contrato_id: string | null;
  documento_externo_ref: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  /** Cobranças em aberto candidatas a liquidação. */
  cobrancas: ReciboCobrancaAlvo[];
  /** id de cobrança pré-selecionada (ex.: ação a partir de uma linha). */
  preselectId?: string | null;
  onEmitido: () => void;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const hojeISO = () => new Date().toISOString().slice(0, 10);

export function RecibosDialog({
  open,
  onOpenChange,
  orgId,
  cobrancas,
  preselectId,
  onEmitido,
}: Props) {
  const qc = useQueryClient();
  const [cobrancaId, setCobrancaId] = useState<string>('');
  const [valor, setValor] = useState('');
  const [metodo, setMetodo] = useState<string>('transferencia');
  const [data, setData] = useState<string>(hojeISO());
  const [obs, setObs] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [falha, setFalha] = useState<ErroReciboExplicado | null>(null);

  const elegiveis = useMemo(() => cobrancas.filter((c) => c.saldoPagar > 0.005), [cobrancas]);
  const cobranca = useMemo(
    () => elegiveis.find((c) => c.id === cobrancaId) ?? null,
    [elegiveis, cobrancaId]
  );

  // Ao abrir, seleciona a cobrança pré-indicada (ou a única) e propõe o saldo.
  useEffect(() => {
    if (!open) return;
    const inicial =
      (preselectId && elegiveis.find((c) => c.id === preselectId)?.id) ||
      (elegiveis.length === 1 ? elegiveis[0].id : '');
    setCobrancaId(inicial);
    setMetodo('transferencia');
    setData(hojeISO());
    setObs('');
    setFalha(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselectId]);

  // Quando muda a cobrança escolhida, propõe o saldo por liquidar.
  useEffect(() => {
    if (cobranca) setValor(String(round2(cobranca.saldoPagar)));
    setFalha(null);
  }, [cobranca]);

  const valorNum = round2(parseFloat(valor.replace(',', '.')) || 0);
  const excede = !!cobranca && valorNum > cobranca.saldoPagar + 0.005;
  const liquidaTotal = !!cobranca && valorNum >= cobranca.saldoPagar - 0.005;

  const erro = useMemo(() => {
    if (!cobranca) return 'Selecione a fatura a liquidar.';
    if (valorNum <= 0) return 'Indique um valor.';
    if (excede)
      return `O valor excede o saldo por liquidar (${formatCurrency(cobranca.saldoPagar)}).`;
    if (!metodo) return 'Selecione o método de pagamento.';
    return null;
  }, [cobranca, valorNum, excede, metodo]);

  async function handleEmitir() {
    if (!cobranca || erro) {
      if (erro) toast.error(erro);
      return;
    }
    setSubmitting(true);
    setFalha(null);
    try {
      const recibo = await registarRecibo(orgId, cobranca, {
        valor: valorNum,
        metodo,
        data,
        observacoes: obs,
      });
      if (recibo.invoice) {
        try {
          await baixarDocumentoPdf(recibo.invoice);
        } catch {
          /* download best-effort */
        }
      }
      if (recibo.aviso) toast.warning(recibo.aviso, { duration: DURACAO_AVISO_FALHA_MS });

      toast.success(`Recibo de ${formatCurrency(valorNum)} registado.`);
      qc.invalidateQueries({ queryKey: ['renting'] });
      qc.invalidateQueries({ queryKey: ['faturas-por-liquidar'] });
      if (cobranca.contrato_id) {
        qc.invalidateQueries({ queryKey: ['contrato-cobrancas', cobranca.contrato_id] });
      } else {
        qc.invalidateQueries({ queryKey: ['reserva-cobrancas'] });
      }
      onEmitido();
      onOpenChange(false);
    } catch (e: unknown) {
      console.error('Erro ao registar recibo:', e);
      setFalha(e instanceof ErroRecibo ? e.explicacao : explicarErroRecibo(e, 'gravar'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-4 pb-4 border-b bg-card shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Fazer recibo
          </DialogTitle>
          <DialogDescription>
            Regista o pagamento de uma fatura em aberto. Gera um crédito na conta-corrente.
          </DialogDescription>
        </DialogHeader>

        {elegiveis.length === 0 ? (
          <p className="flex-1 overflow-y-auto px-6 py-6 text-center text-sm text-muted-foreground">
            Não há faturas em aberto para liquidar.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Fatura a liquidar</Label>
              <Select value={cobrancaId} onValueChange={setCobrancaId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione a fatura" />
                </SelectTrigger>
                <SelectContent>
                  {elegiveis.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {(c.documento_externo_ref || c.id.slice(0, 8).toUpperCase()) +
                        ` · ${c.destinatario_nome} · ` +
                        formatCurrency(c.saldoPagar)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {cobranca && (
              <div className="rounded-md border divide-y text-sm">
                <Linha label="Total da fatura" value={formatCurrency(cobranca.valor_total)} />
                <Linha
                  label="Saldo por liquidar"
                  value={formatCurrency(cobranca.saldoPagar)}
                  strong
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor recebido</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  max={cobranca?.saldoPagar}
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data</Label>
                <Input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Método de pagamento</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METODO_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Notas do recibo…"
                rows={2}
              />
            </div>

            {excede && (
              <p className="text-[11px] text-destructive">
                O valor excede o saldo por liquidar ({formatCurrency(cobranca?.saldoPagar)}).
              </p>
            )}
            {!excede && cobranca && (
              <p
                className={cn(
                  'text-[11px] text-muted-foreground',
                  liquidaTotal && 'text-emerald-600 dark:text-emerald-400'
                )}
              >
                {liquidaTotal
                  ? 'Liquida a fatura na totalidade — passa a paga.'
                  : 'Liquidação parcial — a fatura mantém saldo em aberto.'}
              </p>
            )}
            {falha && <ErroReciboAviso erro={falha} />}
          </div>
        )}

        <div className="px-6 py-4 border-t bg-card flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleEmitir}
            disabled={
              submitting ||
              !!erro ||
              elegiveis.length === 0 ||
              (falha !== null && !falha.podeTentarDeNovo)
            }
            className="gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Registar recibo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('tabular-nums', strong && 'font-semibold')}>{value}</span>
    </div>
  );
}
