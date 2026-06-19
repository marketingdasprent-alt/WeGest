/**
 * Faturar uma RESERVA (pagamento antecipado, antes de abrir o contrato).
 * Cria uma cobrança ligada à reserva (reserva_id), emite o documento fiscal
 * no software de faturação configurado e regista a conta-corrente. Ao converter
 * a reserva em contrato, este herda a cobrança (trigger) — não refatura.
 *
 * Convenção: na reserva, `valor_total` é COM IVA incluído (ver ReservaTabCaixa).
 */
import { useMemo, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/formatters';
import { METODO_OPTIONS, metodoLabel } from '@/components/administrativo/faturacao';
import { openFaturacaoDocumento, type FaturacaoDocEmitente } from '@/utils/faturacaoDocumento';
import { baixarDocumentoPdf, clienteRowToFatura } from '@/lib/faturacao';
import { useEmitirEEscreverFatura } from '@/hooks/useFaturacao';
import { useOrgDefinicoes } from '@/hooks/useOrgDefinicoes';
import { faturacaoProviderLabel } from '@/lib/faturacaoProviders';
import type { ItemFatura } from '@/types/faturacao';
import type { Reserva } from '@/types/reserva';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reserva: Reserva;
  emitente?: FaturacaoDocEmitente | null;
  onFaturado: () => void;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const hoje = () => new Date().toISOString().slice(0, 10);
const maisDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function ReservaFaturarDialog({ open, onOpenChange, reserva, emitente, onFaturado }: Props) {
  const qc = useQueryClient();
  const emitirMut = useEmitirEEscreverFatura();
  const { data: orgDef } = useOrgDefinicoes();
  const providerLabel = faturacaoProviderLabel(orgDef?.faturacao_provider);
  const [tipo, setTipo] = useState<'fatura' | 'fatura_recibo'>('fatura');
  const [metodo, setMetodo] = useState<string>('transferencia');
  const [dataDoc, setDataDoc] = useState<string>(hoje());
  const [dataVenc, setDataVenc] = useState<string>(maisDias(30));
  const [submitting, setSubmitting] = useState(false);

  // valor_total da reserva é COM IVA; em tvde/slot o IVA é 0.
  const calc = useMemo(() => {
    const totalComIva = round2(reserva.valor_total ?? 0);
    const taxaIva = reserva.regime === 'tvde' || reserva.regime === 'slot' ? 0 : 23;
    const subtotal = taxaIva > 0 ? round2(totalComIva / (1 + taxaIva / 100)) : totalComIva;
    const iva = round2(totalComIva - subtotal);
    return { totalComIva, taxaIva, subtotal, iva };
  }, [reserva.valor_total, reserva.regime]);

  const podeFaturar = !!reserva.cliente_id && calc.totalComIva > 0;
  const codigoLabel = `Reserva #${reserva.codigo}`;

  async function abrirDocumentoLocal(numeroDoc: string) {
    let clienteNif: string | null = null;
    let clienteMorada: string | null = null;
    try {
      const { data: cli } = await supabase
        .from('clientes')
        .select('nif, morada, codigo_postal, cidade')
        .eq('id', reserva.cliente_id!)
        .single();
      if (cli) {
        clienteNif = (cli as any).nif ?? null;
        clienteMorada =
          [(cli as any).morada, (cli as any).codigo_postal, (cli as any).cidade]
            .filter(Boolean)
            .join(', ') || null;
      }
    } catch {
      /* cabeçalho do cliente é opcional */
    }
    const aberto = openFaturacaoDocumento({
      tipo: tipo === 'fatura_recibo' ? 'fatura_recibo' : 'fatura',
      numero: numeroDoc,
      data: dataDoc,
      emitente: emitente ?? null,
      cliente: { nome: reserva.cliente_nome ?? 'Cliente', nif: clienteNif, morada: clienteMorada },
      linhas: [{ descricao: `Aluguer — ${codigoLabel}`, valor: calc.subtotal }],
      subtotal: calc.subtotal,
      taxaIva: calc.taxaIva,
      iva: calc.iva,
      total: calc.totalComIva,
      metodoLabel: tipo === 'fatura_recibo' ? metodoLabel(metodo) : null,
    });
    if (!aberto) toast.warning('Pop-up bloqueado — não foi possível abrir o documento local.');
  }

  async function fetchClienteFatura() {
    try {
      const { data } = await supabase
        .from('clientes')
        .select('nome, nif, email, morada, codigo_postal, localidade')
        .eq('id', reserva.cliente_id!)
        .single();
      return clienteRowToFatura(data, reserva.cliente_nome ?? undefined);
    } catch {
      return clienteRowToFatura(null, reserva.cliente_nome ?? undefined);
    }
  }

  async function handleCriar() {
    if (!podeFaturar) {
      toast.error('A reserva precisa de cliente e valor para ser faturada.');
      return;
    }
    setSubmitting(true);
    try {
      // Evitar faturar a mesma reserva duas vezes.
      const { data: existentes } = await supabase
        .from('contrato_cobrancas')
        .select('id')
        .eq('reserva_id', reserva.id)
        .in('estado', ['emitida', 'paga']);
      if (existentes && existentes.length > 0) {
        toast.error('Esta reserva já foi faturada.');
        onFaturado();
        onOpenChange(false);
        return;
      }

      const periodoDe = (reserva.data_inicio ?? hoje()).slice(0, 10);
      let periodoAte = (reserva.data_fim ?? '').slice(0, 10) || periodoDe;
      if (periodoAte < periodoDe) periodoAte = periodoDe;
      const tipoLabel = tipo === 'fatura_recibo' ? 'Factura-Recibo' : 'Factura';
      const descricao = `${tipoLabel} — ${codigoLabel} · Venc: ${dataVenc.split('-').reverse().join('/')}`;
      const emitidaEm = new Date(`${dataDoc}T12:00:00`).toISOString();

      // Fase 1 — cobrança ligada à reserva (trigger lança o débito).
      const { data: cobInserida, error: cobErr } = await supabase
        .from('contrato_cobrancas')
        .insert({
          org_id: reserva.org_id,
          reserva_id: reserva.id,
          contrato_id: null,
          periodo_de: periodoDe,
          periodo_ate: periodoAte,
          descricao,
          destinatario_id: reserva.cliente_id,
          destinatario_papel: 'cliente',
          destinatario_nome: reserva.cliente_nome ?? 'Cliente',
          valor_sem_iva: calc.subtotal,
          taxa_iva: calc.taxaIva,
          emite_fatura_fiscal: true,
          estado: 'emitida',
          emitida_em: emitidaEm,
        })
        .select('id')
        .single();
      if (cobErr) throw cobErr;
      const cobrancaId: string = cobInserida.id;

      // Factura-Recibo → regista o recibo (liquidação imediata).
      if (tipo === 'fatura_recibo' && calc.totalComIva > 0) {
        const { error: recErr } = await supabase.from('recibos').insert({
          org_id: reserva.org_id,
          entidade_id: reserva.cliente_id!,
          contrato_id: null,
          valor: calc.totalComIva,
          data_recibo: dataDoc,
          metodo,
          estado: 'ativo',
          referencia: cobrancaId,
          observacoes: `Liquidação ${descricao}`,
        });
        if (recErr) throw recErr;
      }

      qc.invalidateQueries({ queryKey: ['reserva-cobrancas', reserva.id] });
      qc.invalidateQueries({ queryKey: ['renting', 'reservas'] });

      // Fase 2 — emissão fiscal no provider configurado (não reverte a Fase 1).
      try {
        const cliente = await fetchClienteFatura();
        const itens: ItemFatura[] = [
          {
            descricao: `Aluguer — ${codigoLabel}`,
            quantidade: 1,
            preco_unitario: calc.subtotal,
            taxa_iva: calc.taxaIva,
          },
        ];
        const res = await emitirMut.mutateAsync({
          payload: {
            tipo: tipo === 'fatura_recibo' ? 'FR' : 'FT',
            cliente,
            itens,
            cobranca_id: cobrancaId,
            referencia_externa: codigoLabel,
          },
          cobrancaId,
          contratoId: reserva.id, // só para chave de invalidação; inofensivo
        });
        if (res.invoice) {
          try {
            await baixarDocumentoPdf(res.invoice);
          } catch {
            /* download best-effort */
          }
        }
        toast.success(
          `Documento fiscal emitido no ${providerLabel}${res.fullDocNumber ? ` (${res.fullDocNumber})` : ''}.`
        );
        if (res.warning) toast.warning(res.warning);
      } catch (kiErr: any) {
        console.error('Falha a emitir o documento fiscal da reserva:', kiErr);
        toast.warning(
          'Reserva faturada, mas o documento fiscal ficou por emitir. Pode reemiti-lo na lista de faturas.'
        );
        await abrirDocumentoLocal(descricao);
      }

      onFaturado();
      onOpenChange(false);
    } catch (e: any) {
      console.error('Erro ao faturar reserva:', e);
      toast.error(`Erro ao faturar: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Faturar {codigoLabel}
          </DialogTitle>
          <DialogDescription>
            Pagamento antecipado da reserva. Ao criar o contrato, este herda esta fatura.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de documento</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={tipo === 'fatura' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setTipo('fatura')}
              >
                Factura
              </Button>
              <Button
                type="button"
                variant={tipo === 'fatura_recibo' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setTipo('fatura_recibo')}
              >
                Factura-Recibo
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Método</Label>
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
              <Label className="text-xs">Data documento</Label>
              <Input
                type="date"
                value={dataDoc}
                onChange={(e) => setDataDoc(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vencimento</Label>
              <Input
                type="date"
                value={dataVenc}
                onChange={(e) => setDataVenc(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="rounded-md border divide-y text-sm">
            <Row label="Destinatário" value={reserva.cliente_nome ?? '—'} />
            <Row label="Sub-total" value={formatCurrency(calc.subtotal)} />
            <Row label={`IVA (${calc.taxaIva}%)`} value={formatCurrency(calc.iva)} muted />
            <Row label="Total" value={formatCurrency(calc.totalComIva)} total />
          </div>

          {!reserva.cliente_id && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              A reserva não tem cliente associado — não é possível faturar.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleCriar} disabled={submitting || !podeFaturar} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Faturar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  muted,
  total,
}: {
  label: string;
  value: string;
  muted?: boolean;
  total?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span
        className={cn('text-xs', muted ? 'text-muted-foreground' : '', total && 'font-semibold')}
      >
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          total ? 'text-base font-bold' : '',
          muted && 'text-muted-foreground text-xs'
        )}
      >
        {value}
      </span>
    </div>
  );
}
