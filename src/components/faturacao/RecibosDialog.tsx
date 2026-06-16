/**
 * Diálogo "Fazer recibo" — regista um pagamento (liquidação) sobre uma
 * fatura/cobrança em aberto. O recibo gera um crédito na conta-corrente
 * (trigger fn_recibo_posta_movimento); se liquidar o saldo todo, a cobrança
 * passa a 'paga'.
 *
 * NOTA: a emissão do documento fiscal Recibo (RC) no KeyInvoice é adicionada
 * na fase seguinte; por agora o recibo é registo interno de conta-corrente.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Receipt } from 'lucide-react';
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
import { emitirDocumento, baixarDocumentoPdf, clienteRowToKI } from '@/lib/keyinvoice';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselectId]);

  // Quando muda a cobrança escolhida, propõe o saldo por liquidar.
  useEffect(() => {
    if (cobranca) setValor(String(round2(cobranca.saldoPagar)));
  }, [cobranca]);

  const valorNum = round2(parseFloat(valor.replace(',', '.')) || 0);
  const excede = !!cobranca && valorNum > cobranca.saldoPagar + 0.005;
  const liquidaTotal = !!cobranca && valorNum >= cobranca.saldoPagar - 0.005;

  const erro = useMemo(() => {
    if (!cobranca) return 'Selecione a fatura a liquidar.';
    if (valorNum <= 0) return 'Indique um valor.';
    if (excede) return `O valor excede o saldo por liquidar (${formatCurrency(cobranca.saldoPagar)}).`;
    if (!metodo) return 'Selecione o método de pagamento.';
    return null;
  }, [cobranca, valorNum, excede, metodo]);

  async function handleEmitir() {
    if (!cobranca || erro) {
      if (erro) toast.error(erro);
      return;
    }
    setSubmitting(true);
    try {
      const descricao =
        obs.trim() ||
        `Liquidação de ${cobranca.documento_externo_ref || cobranca.descricao || 'fatura'}`;

      const { error } = await supabase.from('recibos').insert({
        org_id: orgId,
        entidade_id: cobranca.destinatario_id,
        contrato_id: cobranca.contrato_id,
        valor: valorNum,
        data_recibo: data,
        metodo,
        observacoes: descricao,
        referencia: cobranca.id,
        estado: 'ativo',
      });
      if (error) throw error;

      // Liquidação total → marca a cobrança como paga.
      if (liquidaTotal) {
        await supabase
          .from('contrato_cobrancas')
          .update({ estado: 'paga', pago_em: new Date().toISOString() })
          .eq('id', cobranca.id)
          .eq('estado', 'emitida');
      }

      // Documento fiscal Recibo (RC) no KeyInvoice — só se a fatura é KeyInvoice
      // e o RC estiver configurado (KI_DOCTYPE_RC). Caso contrário, fica só interno.
      if (cobranca.documento_externo_ref) {
        try {
          const { data: cli } = await supabase
            .from('clientes')
            .select('nome, nif, email, morada, codigo_postal, localidade')
            .eq('id', cobranca.destinatario_id)
            .maybeSingle();
          const res = await emitirDocumento({
            tipo: 'RC',
            cliente: clienteRowToKI(cli, cobranca.destinatario_nome),
            itens: [
              {
                descricao: `Recibo de ${cobranca.documento_externo_ref}`,
                quantidade: 1,
                preco_unitario: valorNum,
                taxa_iva: 0,
              },
            ],
            cobranca_id: cobranca.id,
            documento_referencia: cobranca.documento_externo_ref,
            referencia_externa: cobranca.documento_externo_ref,
            observacoes: descricao,
          });
          if (res.invoice) {
            try {
              await baixarDocumentoPdf(res.invoice);
            } catch {
              /* download best-effort */
            }
          }
          if (res.warning) toast.warning(res.warning);
        } catch (rcErr: any) {
          // RC não configurado/falhou — o recibo interno fica registado na mesma.
          console.warn('Recibo fiscal (RC) não emitido:', rcErr?.message);
        }
      }

      toast.success(`Recibo de ${formatCurrency(valorNum)} registado.`);
      qc.invalidateQueries({ queryKey: ['renting'] });
      if (cobranca.contrato_id)
        qc.invalidateQueries({ queryKey: ['contrato-cobrancas', cobranca.contrato_id] });
      onEmitido();
      onOpenChange(false);
    } catch (e: any) {
      console.error('Erro ao registar recibo:', e);
      toast.error(`Erro ao registar recibo: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Fazer recibo
          </DialogTitle>
          <DialogDescription>
            Regista o pagamento de uma fatura em aberto. Gera um crédito na conta-corrente.
          </DialogDescription>
        </DialogHeader>

        {elegiveis.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Não há faturas em aberto para liquidar.
          </p>
        ) : (
          <div className="space-y-4">
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
              <p className={cn('text-[11px] text-muted-foreground', liquidaTotal && 'text-emerald-600 dark:text-emerald-400')}>
                {liquidaTotal
                  ? 'Liquida a fatura na totalidade — passa a paga.'
                  : 'Liquidação parcial — a fatura mantém saldo em aberto.'}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleEmitir}
            disabled={submitting || !!erro || elegiveis.length === 0}
            className="gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Registar recibo
          </Button>
        </DialogFooter>
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
