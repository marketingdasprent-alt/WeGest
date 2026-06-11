import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Receipt, Lock, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { useContratoCoberturas } from '@/hooks/useContratoCoberturas';
import { useContratoExtras, calcExtraTotal } from '@/hooks/useContratoExtras';
import { useContratoTaxas, calcTaxaValor } from '@/hooks/useContratoTaxas';
import { useContratoCondutores } from '@/hooks/useContratoCondutores';
import type { ContratoRenting } from '@/types/contratoRenting';
import {
  ContratoFaturarDialog,
  type FaturaCalculo,
  type EntidadeOption,
} from './ContratoFaturarDialog';

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Dias entre datas (ceil; 1d+1h = 2 dias) — espelha public.fn_contrato_dias(). */
function calcDias(inicio?: string | null, fim?: string | null): number {
  if (!inicio || !fim) return 0;
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 86400000));
}

const ESTADO_COBRANCA_CLASS: Record<string, string> = {
  pendente: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  emitida: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  paga: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  anulada: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

interface CobrancaRow {
  id: string;
  documento_externo_ref: string | null;
  estado: string;
  valor_total: number | null;
  emitida_em: string | null;
  created_at: string;
  destinatario_nome: string;
}

interface Props {
  contrato: ContratoRenting;
}

export function ContratoTabFaturar({ contrato }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: coberturas } = useContratoCoberturas(contrato.id);
  const { data: extras } = useContratoExtras(contrato.id);
  const { data: taxas } = useContratoTaxas(contrato.id);
  const { data: condutores } = useContratoCondutores(contrato.id);

  const principal = useMemo(
    () => (condutores ?? []).find((c) => c.is_principal && c.cliente_id) ?? null,
    [condutores]
  );

  const idsClientes = useMemo(() => {
    const ids = [contrato.cliente_id, principal?.cliente_id].filter(Boolean) as string[];
    return Array.from(new Set(ids));
  }, [contrato.cliente_id, principal]);

  const { data: clientesNomes } = useQuery({
    queryKey: ['faturar-clientes-nomes', idsClientes.slice().sort().join(',')],
    queryFn: async () => {
      if (!idsClientes.length) return {} as Record<string, string>;
      const { data } = await supabase.from('clientes').select('id, nome').in('id', idsClientes);
      const m: Record<string, string> = {};
      (data ?? []).forEach((c: any) => (m[c.id] = c.nome));
      return m;
    },
    enabled: idsClientes.length > 0,
  });

  const { data: cobrancas, refetch: refetchCobrancas } = useQuery({
    queryKey: ['contrato-cobrancas', contrato.id],
    queryFn: async (): Promise<CobrancaRow[]> => {
      const { data, error } = await supabase
        .from('contrato_cobrancas')
        .select(
          'id, documento_externo_ref, estado, valor_total, emitida_em, created_at, destinatario_nome'
        )
        .eq('contrato_id', contrato.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CobrancaRow[];
    },
  });

  const fatura: FaturaCalculo = useMemo(() => {
    const dias = calcDias(contrato.data_inicio, contrato.data_fim);
    const manual = contrato.valor_total_manual != null && contrato.valor_total_manual > 0;
    const baseAluguer = manual
      ? contrato.valor_total_manual!
      : (contrato.tarifa_diaria ?? 0) * dias;

    const itens: FaturaCalculo['itens'] = [
      {
        descricao: manual
          ? 'Aluguer (valor manual)'
          : `Aluguer${dias ? ` (${dias} dia${dias !== 1 ? 's' : ''})` : ''}`,
        valor: round2(baseAluguer),
      },
    ];

    let custoCoberturas = 0;
    (coberturas ?? []).forEach((c) => {
      const v = (c.preco_dia ?? 0) * dias;
      custoCoberturas += v;
      itens.push({ descricao: `Cobertura: ${c.cobertura_nome}`, valor: round2(v) });
    });

    let custoExtras = 0;
    (extras ?? []).forEach((e) => {
      const v = calcExtraTotal(e as any, dias);
      custoExtras += v;
      itens.push({ descricao: `Extra: ${e.extra_nome}`, valor: round2(v) });
    });

    const subtotalBruto = baseAluguer + custoCoberturas + custoExtras;
    const descPct = contrato.desconto_percentagem ?? 0;
    const desconto = subtotalBruto * (descPct / 100);
    if (desconto > 0) itens.push({ descricao: `Desconto (${descPct}%)`, valor: -round2(desconto) });

    const subtotal = subtotalBruto - desconto;
    // TVDE e Slot já têm IVA incluído no preço — fatura sem IVA adicional
    const taxaIva =
      contrato.regime === 'tvde' || contrato.regime === 'slot' ? 0 : (contrato.taxa_iva ?? 23);
    const iva = subtotal * (taxaIva / 100);

    const taxasItens: FaturaCalculo['taxasItens'] = [];
    let custoTaxas = 0;
    (taxas ?? []).forEach((t) => {
      const v = calcTaxaValor(t as any, subtotal);
      custoTaxas += v;
      taxasItens.push({ descricao: `Taxa: ${t.taxa_nome}`, valor: round2(v) });
    });

    const subtotalR = round2(subtotal);
    const ivaR = round2(iva);
    const custoTaxasR = round2(custoTaxas);
    return {
      dias,
      itens,
      subtotal: subtotalR,
      iva: ivaR,
      taxasItens,
      custoTaxas: custoTaxasR,
      total: round2(subtotalR + ivaR + custoTaxasR),
      // movimento WeGest = subtotal + IVA (taxas são emitidas pelo programa externo)
      valorRegistado: round2(subtotalR + ivaR),
      taxaIva,
    };
  }, [contrato, coberturas, extras, taxas]);

  const clienteEntidade: EntidadeOption = {
    id: contrato.cliente_id,
    nome: clientesNomes?.[contrato.cliente_id] || 'Cliente do contrato',
  };
  const condutorEntidade: EntidadeOption | null = principal?.cliente_id
    ? {
        id: principal.cliente_id,
        nome: clientesNomes?.[principal.cliente_id] || 'Condutor principal',
        contratoCondutorId: principal.id,
      }
    : null;

  const jaFacturado = contrato.estado_financeiro !== 'pendente';

  return (
    <div className="space-y-4">
      {jaFacturado ? (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Lock className="h-5 w-5 text-indigo-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">
                Contrato {contrato.estado_financeiro === 'pago' ? 'pago' : 'facturado'}
              </p>
              <p className="text-xs text-muted-foreground">
                {contrato.facturado_em
                  ? `Facturado em ${formatDate(contrato.facturado_em)}`
                  : 'Os totais estão congelados.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Receipt className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Faturar este contrato</p>
                <p className="text-xs text-muted-foreground">
                  Total a faturar:{' '}
                  <span className="font-semibold">{formatCurrency(fatura.valorRegistado)}</span>
                  {fatura.dias > 0 ? ` · ${fatura.dias} dia${fatura.dias !== 1 ? 's' : ''}` : ''}
                </p>
              </div>
            </div>
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Receipt className="h-4 w-4" />
              Faturar contrato
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Faturas/cobranças deste contrato */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Faturas do contrato
        </p>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº / Ref.</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!cobrancas || cobrancas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground text-sm">
                    Ainda sem faturas para este contrato.
                  </TableCell>
                </TableRow>
              ) : (
                cobrancas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">
                      {c.documento_externo_ref || c.id.slice(0, 8).toUpperCase()}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={c.destinatario_nome}>
                      {c.destinatario_nome}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(c.valor_total)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('capitalize border', ESTADO_COBRANCA_CLASS[c.estado] ?? '')}
                      >
                        {c.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(c.emitida_em || c.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ContratoFaturarDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contrato={contrato}
        fatura={fatura}
        clienteEntidade={clienteEntidade}
        condutorEntidade={condutorEntidade}
        onFaturado={() => refetchCobrancas()}
      />
    </div>
  );
}
