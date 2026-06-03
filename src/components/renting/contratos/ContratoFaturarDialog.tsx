import { useState } from 'react';
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
import type { ContratoRenting } from '@/types/contratoRenting';

export interface FaturaItem {
  descricao: string;
  valor: number;
}
export interface FaturaCalculo {
  dias: number;
  itens: FaturaItem[];
  subtotal: number;
  iva: number;
  taxasItens: FaturaItem[];
  /** soma das taxas (pós-IVA) — emitidas externamente, fora do movimento WeGest */
  custoTaxas: number;
  /** total fiscal completo (subtotal + IVA + taxas) — só informativo */
  total: number;
  /** valor registado no movimento de conta-corrente (subtotal + IVA, sem taxas) */
  valorRegistado: number;
  taxaIva: number;
}
export interface EntidadeOption {
  id: string;
  nome: string;
  /** preenchido quando é um condutor (liga à vigência) */
  contratoCondutorId?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato: ContratoRenting;
  fatura: FaturaCalculo;
  clienteEntidade: EntidadeOption;
  condutorEntidade: EntidadeOption | null;
  onFaturado: () => void;
}

const hoje = () => new Date().toISOString().slice(0, 10);
const maisDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function ContratoFaturarDialog({
  open,
  onOpenChange,
  contrato,
  fatura,
  clienteEntidade,
  condutorEntidade,
  onFaturado,
}: Props) {
  const qc = useQueryClient();
  const [entidade, setEntidade] = useState<'cliente' | 'condutor'>('cliente');
  const [tipo, setTipo] = useState<'fatura' | 'fatura_recibo'>('fatura');
  const [metodo, setMetodo] = useState<string>('transferencia');
  const [dataDoc, setDataDoc] = useState<string>(hoje());
  const [dataVenc, setDataVenc] = useState<string>(maisDias(30));
  const [submitting, setSubmitting] = useState(false);

  const destinatario =
    entidade === 'condutor' && condutorEntidade ? condutorEntidade : clienteEntidade;
  const faturaZero = fatura.valorRegistado === 0;
  const podeFaturar = fatura.valorRegistado >= 0; // 0€ é permitido (cortesia / 100% desconto)

  async function handleCriar() {
    if (!podeFaturar) {
      toast.error('O total a faturar é negativo — verifique o desconto do contrato.');
      return;
    }
    if (tipo === 'fatura_recibo' && !faturaZero && !metodo) {
      toast.error('Selecione o método de pagamento.');
      return;
    }
    setSubmitting(true);
    try {
      // Reconfirmar o estado na BD (evita faturar o mesmo contrato duas vezes em simultâneo)
      const { data: fresh, error: chkErr } = await supabase
        .from('contratos_renting')
        .select('estado_financeiro')
        .eq('id', contrato.id)
        .single();
      if (chkErr) throw chkErr;
      if (fresh?.estado_financeiro !== 'pendente') {
        toast.error('Este contrato já foi faturado.');
        onFaturado();
        onOpenChange(false);
        return;
      }

      const taxaIva = contrato.taxa_iva ?? 23;
      // As taxas somam-se DEPOIS do IVA e a cobrança não as modela; o movimento WeGest
      // regista subtotal + IVA. A fatura fiscal (com taxas) é emitida pelo programa externo.
      const valorSemIva = fatura.subtotal;

      const periodoDe = (contrato.data_inicio ?? hoje()).slice(0, 10);
      let periodoAte = (contrato.data_fim ?? '').slice(0, 10) || hoje();
      if (periodoAte < periodoDe) periodoAte = periodoDe;

      const papel: 'cliente' | 'condutor' =
        entidade === 'condutor' && condutorEntidade ? 'condutor' : 'cliente';
      const tipoLabel = tipo === 'fatura_recibo' ? 'Factura-Recibo' : 'Factura';
      const descricao = `${tipoLabel} — Contrato #${String(contrato.codigo).padStart(4, '0')} · Venc: ${dataVenc.split('-').reverse().join('/')}`;
      const emitidaEm = new Date(`${dataDoc}T12:00:00`).toISOString();

      // 1) Cobrança (fatura) — estado 'emitida' → trigger posta o débito na conta-corrente
      const { data: cobInserida, error: cobErr } = await supabase
        .from('contrato_cobrancas')
        .insert({
          org_id: contrato.org_id,
          contrato_id: contrato.id,
          periodo_de: periodoDe,
          periodo_ate: periodoAte,
          descricao,
          destinatario_id: destinatario.id,
          destinatario_papel: papel,
          destinatario_nome: destinatario.nome,
          contrato_condutor_id:
            papel === 'condutor' ? (destinatario.contratoCondutorId ?? null) : null,
          valor_sem_iva: valorSemIva,
          taxa_iva: taxaIva,
          emite_fatura_fiscal: true,
          estado: 'emitida',
          emitida_em: emitidaEm,
        })
        .select('id')
        .single();
      if (cobErr) throw cobErr;

      // 2) Factura-Recibo → também regista o recibo (crédito/liquidação).
      //    A 0€ não há recibo (recibos tem CHECK valor > 0 e não há nada a liquidar).
      //    `referencia` liga o recibo à cobrança → a listagem mostra-os como 1 só linha.
      if (tipo === 'fatura_recibo' && fatura.valorRegistado > 0) {
        const { error: recErr } = await supabase.from('recibos').insert({
          org_id: contrato.org_id,
          entidade_id: destinatario.id,
          contrato_id: contrato.id,
          valor: fatura.valorRegistado,
          data_recibo: dataDoc,
          metodo,
          estado: 'ativo',
          referencia: cobInserida?.id ?? null,
          observacoes: `Liquidação ${descricao}`,
        });
        if (recErr) throw recErr;
      }

      // 3) Marcar contrato como facturado (trigger congela os totais).
      //    Guarda estado='pendente' para não sobrepor uma faturação concorrente.
      const { error: updErr } = await supabase
        .from('contratos_renting')
        .update({ estado_financeiro: 'facturado' })
        .eq('id', contrato.id)
        .eq('estado_financeiro', 'pendente');
      if (updErr) throw updErr;

      toast.success(
        faturaZero
          ? 'Fatura a 0€ registada (sem movimento de conta-corrente).'
          : tipo === 'fatura_recibo'
            ? 'Fatura e recibo registados.'
            : 'Fatura registada para emissão pelo programa externo.'
      );
      qc.invalidateQueries({ queryKey: ['renting'] });
      qc.invalidateQueries({ queryKey: ['contrato-cobrancas', contrato.id] });
      onFaturado();
      onOpenChange(false);
    } catch (e: any) {
      console.error('Erro ao faturar contrato:', e);
      if (e?.code === '23505') {
        toast.error('Já existe uma fatura para este destinatário e período.');
      } else {
        toast.error(`Erro ao faturar: ${e?.message ?? 'tente novamente'}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Faturar contrato #{String(contrato.codigo).padStart(4, '0')}
          </DialogTitle>
          <DialogDescription>
            Regista a fatura no WeGest. A fatura fiscal é emitida pelo programa externo (Primavera).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Entidade + Tipo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Entidade de Faturação</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={entidade === 'cliente' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setEntidade('cliente')}
                >
                  Cliente
                </Button>
                <Button
                  type="button"
                  variant={entidade === 'condutor' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  disabled={!condutorEntidade}
                  title={
                    !condutorEntidade
                      ? 'O condutor principal tem de ser um cliente. Motoristas TVDE não podem ser destinatários de fatura.'
                      : undefined
                  }
                  onClick={() => setEntidade('condutor')}
                >
                  Condutor Principal
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{destinatario.nome}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Fatura</Label>
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
              <p className="text-[11px] text-muted-foreground">
                {tipo === 'fatura_recibo'
                  ? 'Inclui o recibo (liquidação imediata).'
                  : 'Apenas a fatura.'}
              </p>
            </div>
          </div>

          {/* Método + Datas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Método de Pagamento</Label>
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
              <Label className="text-xs">Data Documento</Label>
              <Input
                type="date"
                value={dataDoc}
                onChange={(e) => setDataDoc(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data Vencimento</Label>
              <Input
                type="date"
                value={dataVenc}
                onChange={(e) => setDataVenc(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {/* Artigos */}
          <div className="rounded-md border">
            <div className="px-3 py-2 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Artigos a faturar{' '}
              {fatura.dias > 0 ? `· ${fatura.dias} dia${fatura.dias !== 1 ? 's' : ''}` : ''}
            </div>
            <div className="divide-y">
              {fatura.itens.map((it, i) => (
                <Row key={`i-${i}`} label={it.descricao} value={it.valor} />
              ))}
              <Row label="Sub-total" value={fatura.subtotal} strong />
              <Row label={`IVA (${fatura.taxaIva}%)`} value={fatura.iva} muted />
              <Row label="Total a faturar" value={fatura.valorRegistado} total />
            </div>
          </div>

          {fatura.taxasItens.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Taxas no valor de {formatCurrency(fatura.custoTaxas)} (
              {fatura.taxasItens.map((t) => t.descricao.replace('Taxa: ', '')).join(', ')}) são
              emitidas pelo programa externo e não entram neste movimento de conta-corrente.
            </p>
          )}

          {!podeFaturar ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              O total a faturar é negativo. Verifique o desconto do contrato antes de faturar.
            </p>
          ) : faturaZero ? (
            <p className="text-xs text-muted-foreground">
              Fatura a 0€ (cortesia / 100% desconto) — o contrato fica facturado, mas não gera
              movimento de conta-corrente.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleCriar} disabled={submitting || !podeFaturar} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
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
  strong,
  total,
}: {
  label: string;
  value: number;
  muted?: boolean;
  strong?: boolean;
  total?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <span className={cn(muted && 'text-muted-foreground text-xs', total && 'font-semibold')}>
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          total ? 'text-base font-bold' : strong ? 'font-medium' : '',
          muted && 'text-muted-foreground text-xs',
          value < 0 && 'text-rose-600 dark:text-rose-400'
        )}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}
