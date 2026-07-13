import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Receipt, Lock, FileText, Download, Loader2, Send, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import { useInvoicesByContrato, useEmitirEEscreverFatura } from '@/hooks/useFaturacao';
import { baixarDocumentoPdf, clienteRowToFatura, anularCobrancasFaturacao } from '@/lib/faturacao';
import type { InvoiceMetadata, ItemFatura } from '@/types/faturacao';
import type { ContratoRenting } from '@/types/contratoRenting';
import type { FaturacaoDocEmitente } from '@/utils/faturacaoDocumento';
import {
  ContratoFaturarDialog,
  type FaturaCalculo,
  type EntidadeOption,
} from './ContratoFaturarDialog';
import {
  FaturacaoActionsToolbar,
  type ToolbarCobranca,
} from '@/components/faturacao/FaturacaoActionsToolbar';
import { NovaFaturaDialog } from '@/components/faturacao/NovaFaturaDialog';

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
  valor_sem_iva: number | null;
  taxa_iva: number | null;
  emite_fatura_fiscal: boolean;
  emitida_em: string | null;
  created_at: string;
  descricao: string | null;
  destinatario_id: string;
  destinatario_nome: string;
}

interface Props {
  contrato: ContratoRenting;
}

export function ContratoTabFaturar({ contrato }: Props) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [novaFaturaOpen, setNovaFaturaOpen] = useState(false);
  const [reemitindoId, setReemitindoId] = useState<string | null>(null);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const [anularOpen, setAnularOpen] = useState(false);
  const [anularBusy, setAnularBusy] = useState(false);

  const { data: coberturas } = useContratoCoberturas(contrato.id);
  const { data: extras } = useContratoExtras(contrato.id);
  const { data: taxas } = useContratoTaxas(contrato.id);
  const { data: condutores } = useContratoCondutores(contrato.id);
  const { empresas } = useClientesEmpresas();

  // Emitente do cabeçalho do documento: só é inequívoco quando a org tem
  // exatamente uma empresa. Com várias (ou nenhuma) fica sem cabeçalho de emitente.
  const emitente: FaturacaoDocEmitente | null = useMemo(() => {
    if (empresas.length === 1) {
      const e = empresas[0];
      return { nomeCompleto: e.nomeCompleto, nif: e.nif, sede: e.sede };
    }
    return null;
  }, [empresas]);

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
          'id, documento_externo_ref, estado, valor_total, valor_sem_iva, taxa_iva, emite_fatura_fiscal, emitida_em, created_at, descricao, destinatario_id, destinatario_nome'
        )
        .eq('contrato_id', contrato.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CobrancaRow[];
    },
  });

  // Total já creditado (NC ativas) por cobrança — para o saldo e o botão de NC.
  const { data: ncPorCobranca, refetch: refetchNC } = useQuery({
    queryKey: ['contrato-notas-credito', contrato.id],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('notas_credito')
        .select('cobranca_id, valor')
        .eq('contrato_id', contrato.id)
        .eq('estado', 'ativo');
      if (error) {
        // a tabela pode ainda não estar na BD — não partir a aba
        console.warn('notas_credito indisponível:', error.message);
        return {};
      }
      const m: Record<string, number> = {};
      (data ?? []).forEach((n: any) => {
        m[n.cobranca_id] = (m[n.cobranca_id] ?? 0) + Number(n.valor || 0);
      });
      return m;
    },
  });

  // Total já liquidado (recibos ativos) por cobrança — para o saldo a pagar.
  const { data: recibosPorCobranca, refetch: refetchRecibos } = useQuery({
    queryKey: ['contrato-recibos', contrato.id],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('recibos')
        .select('referencia, valor')
        .eq('contrato_id', contrato.id)
        .eq('estado', 'ativo');
      if (error) {
        console.warn('recibos indisponível:', error.message);
        return {};
      }
      const m: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        if (r.referencia) m[r.referencia] = (m[r.referencia] ?? 0) + Number(r.valor || 0);
      });
      return m;
    },
  });

  const { data: invoices = [], refetch: refetchInvoices } = useInvoicesByContrato(contrato.id);
  const emitirMut = useEmitirEEscreverFatura();

  const refetchAll = () => {
    refetchCobrancas();
    refetchNC();
    refetchRecibos();
    refetchInvoices();
  };

  // Pode anular se o contrato está facturado/pago, OU se há cobranças activas
  // (cobre o edge-case de um FR em que o recibo falhou a meio: contrato fica
  // pendente mas a cobrança ficou emitida — o botão precisa de aparecer na mesma).
  const temCobrancasAtivas = (cobrancas ?? []).some(
    (c) => c.estado === 'emitida' || c.estado === 'paga'
  );
  const podeAnularFaturacao =
    contrato.estado_financeiro === 'facturado' ||
    contrato.estado_financeiro === 'pago' ||
    temCobrancasAtivas;

  /**
   * Anula a faturação do contrato → volta a "não faturado" (Pendente), re-faturável.
   * Desfaz tudo o que a faturação criou na conta-corrente: anula recibos e notas de
   * crédito ativos (estornos a débito) e a(s) cobrança(s) (estorno a crédito) — os
   * estornos cancelam-se entre si, deixando o saldo a zero. NÃO emite Nota de Crédito
   * nem cancela o documento fiscal no provider (isso, se necessário, é manual).
   */
  async function anularFaturacao() {
    setAnularBusy(true);
    try {
      const ativasIds = (cobrancas ?? [])
        .filter((c) => c.estado === 'emitida' || c.estado === 'paga')
        .map((c) => c.id);
      await anularCobrancasFaturacao(ativasIds);

      // Contrato volta a "não faturado" (limpa o snapshot de totais congelado).
      const { error: upErr } = await supabase
        .from('contratos_renting')
        .update({
          estado_financeiro: 'pendente',
          facturado_em: null,
          total_subtotal: null,
          total_iva: null,
          total_final: null,
        })
        .eq('id', contrato.id);
      if (upErr) throw upErr;

      toast.success('Faturação anulada — o contrato voltou a "não faturado".');
      setAnularOpen(false);
      qc.invalidateQueries({ queryKey: ['renting'] });
      qc.invalidateQueries({ queryKey: ['contrato-historico', contrato.id] });
      refetchAll();
    } catch (e: any) {
      console.error('Erro ao anular faturação:', e);
      toast.error(`Erro ao anular faturação: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setAnularBusy(false);
    }
  }

  // Última fatura fiscal (FT/FR emitida) por cobrança — p/ download do PDF.
  // A `invoices` é 1-para-N por cobrança (uma FT + eventuais NC partilham cobranca_id).
  const invoiceByCobranca = useMemo(() => {
    const m = new Map<string, InvoiceMetadata>();
    for (const inv of invoices) {
      if (!inv.cobranca_id || inv.status !== 'emitida') continue;
      if (inv.tipo !== 'FT' && inv.tipo !== 'FR') continue;
      const prev = m.get(inv.cobranca_id);
      if (!prev || (inv.created_at ?? '') > (prev.created_at ?? '')) m.set(inv.cobranca_id, inv);
    }
    return m;
  }, [invoices]);

  async function baixarPdf(inv: InvoiceMetadata) {
    setBaixandoId(inv.cobranca_id ?? inv.id);
    try {
      await baixarDocumentoPdf(inv);
    } catch (e: any) {
      toast.error(`Erro ao obter PDF: ${e?.message ?? 'indisponível'}`);
    } finally {
      setBaixandoId(null);
    }
  }

  /** Emite (ou reemite) o documento fiscal de uma cobrança que ficou "por emitir". */
  async function reemitirFatura(c: CobrancaRow) {
    setReemitindoId(c.id);
    try {
      // Reconfirmar p/ não duplicar o documento fiscal (idempotência).
      const { data: fresh, error: fErr } = await supabase
        .from('contrato_cobrancas')
        .select('documento_externo_ref')
        .eq('id', c.id)
        .single();
      if (fErr) throw fErr;
      if (fresh?.documento_externo_ref) {
        toast.info('Esta fatura já tem documento fiscal emitido.');
        refetchCobrancas();
        return;
      }
      const { data: cli } = await supabase
        .from('clientes')
        .select('nome, nif, email, morada, codigo_postal, localidade')
        .eq('id', c.destinatario_id)
        .single();
      const isFR = /^fa[c]?tura-recibo/i.test((c.descricao ?? '').trim());
      const codigoLabel = `Contrato #${String(contrato.codigo).padStart(4, '0')}`;
      const itens: ItemFatura[] = [
        {
          descricao: `Aluguer — ${codigoLabel}`,
          quantidade: 1,
          preco_unitario: c.valor_sem_iva ?? 0,
          taxa_iva: c.taxa_iva ?? 0,
        },
      ];
      const res = await emitirMut.mutateAsync({
        payload: {
          tipo: isFR ? 'FR' : 'FT',
          cliente: clienteRowToFatura(cli, c.destinatario_nome),
          itens,
          contrato_id: contrato.id,
          cobranca_id: c.id,
          referencia_externa: codigoLabel,
        },
        cobrancaId: c.id,
        contratoId: contrato.id,
      });
      if (res.invoice) {
        try {
          await baixarDocumentoPdf(res.invoice);
        } catch {
          /* download é best-effort */
        }
      }
      toast.success(
        `Documento fiscal emitido${res.fullDocNumber ? ` (${res.fullDocNumber})` : ''}.`
      );
      if (res.warning) toast.warning(res.warning);
      refetchCobrancas();
      refetchInvoices();
    } catch (e: any) {
      console.error('Erro a reemitir documento fiscal:', e);
      toast.error(`Falha a emitir o documento fiscal: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setReemitindoId(null);
    }
  }

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

    // Rent-a-Car: o preço da tarifa é SEM IVA — soma-se por cima. TVDE/slot:
    // o preço já vem com IVA incluído — decompõe-se (divide), nunca soma
    // (duplicaria o imposto). Mesma lógica que a view contrato_renting_totais
    // e o trigger de congelamento usam.
    const isRentACar = contrato.regime === 'rent_a_car';
    const taxaIva = contrato.taxa_iva ?? (contrato.regime === 'tvde' ? 6 : 23);
    const subtotalBrutoComDesconto = subtotalBruto - desconto;
    let subtotal: number;
    let iva: number;
    let totalComIva: number;
    if (isRentACar) {
      subtotal = subtotalBrutoComDesconto;
      iva = taxaIva > 0 ? subtotal * (taxaIva / 100) : 0;
      totalComIva = subtotal + iva;
    } else {
      totalComIva = subtotalBrutoComDesconto;
      subtotal = taxaIva > 0 ? totalComIva / (1 + taxaIva / 100) : totalComIva;
      iva = totalComIva - subtotal;
    }

    const taxasItens: FaturaCalculo['taxasItens'] = [];
    let custoTaxas = 0;
    (taxas ?? []).forEach((t) => {
      const v = calcTaxaValor(t as any, totalComIva);
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
      total: round2(totalComIva + custoTaxasR),
      // movimento WeGest = valor cobrado pelo aluguer (já com IVA) — sem duplicar o imposto
      valorRegistado: round2(totalComIva),
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

  // Cobranças com saldos pré-computados — alvo de recibo / nota de crédito na toolbar.
  const toolbarCobrancas: ToolbarCobranca[] = useMemo(
    () =>
      (cobrancas ?? []).map((c) => {
        const total = round2(c.valor_total ?? 0);
        const creditado = round2(ncPorCobranca?.[c.id] ?? 0);
        const pago = round2(recibosPorCobranca?.[c.id] ?? 0);
        return {
          id: c.id,
          descricao: c.descricao,
          valor_total: c.valor_total,
          taxa_iva: c.taxa_iva,
          destinatario_id: c.destinatario_id,
          destinatario_nome: c.destinatario_nome,
          contrato_id: contrato.id,
          documento_externo_ref: c.documento_externo_ref,
          emite_fatura_fiscal: c.emite_fatura_fiscal,
          estado: c.estado,
          saldoPagar: round2(total - pago - creditado),
          saldoCreditar: round2(total - creditado),
          jaCreditado: creditado,
        };
      }),
    [cobrancas, ncPorCobranca, recibosPorCobranca, contrato.id]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn('p-2 rounded-lg', jaFacturado ? 'bg-indigo-500/10' : 'bg-primary/10')}
            >
              {jaFacturado ? (
                <Lock className="h-5 w-5 text-indigo-500" />
              ) : (
                <Receipt className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              {jaFacturado ? (
                <>
                  <p className="text-sm font-medium">
                    Contrato {contrato.estado_financeiro === 'pago' ? 'pago' : 'facturado'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {contrato.facturado_em
                      ? `Facturado em ${formatDate(contrato.facturado_em)}`
                      : 'Os totais estão congelados.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Faturar este contrato</p>
                  <p className="text-xs text-muted-foreground">
                    Total a faturar:{' '}
                    <span className="font-semibold">{formatCurrency(fatura.valorRegistado)}</span>
                    {fatura.dias > 0 ? ` · ${fatura.dias} dia${fatura.dias !== 1 ? 's' : ''}` : ''}
                  </p>
                </>
              )}
              {podeAnularFaturacao && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 gap-1.5 text-rose-600 hover:text-rose-700 dark:text-rose-400"
                  onClick={() => setAnularOpen(true)}
                  disabled={anularBusy}
                >
                  {anularBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Anular faturação
                </Button>
              )}
            </div>
          </div>
          <FaturacaoActionsToolbar
            orgId={contrato.org_id}
            emitente={emitente}
            onFaturar={jaFacturado ? undefined : () => setDialogOpen(true)}
            faturarLabel="Faturar contrato"
            onNovaFatura={() => setNovaFaturaOpen(true)}
            cobrancas={toolbarCobrancas}
            onChanged={refetchAll}
          />
        </CardContent>
      </Card>

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
                <TableHead className="text-right">Nota de Crédito</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const visiveis = (cobrancas ?? []).filter((c) => c.estado !== 'anulada');
                if (visiveis.length === 0)
                  return (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-20 text-center text-muted-foreground text-sm"
                      >
                        Ainda sem faturas para este contrato.
                      </TableCell>
                    </TableRow>
                  );
                return visiveis.map((c) => {
                  const creditado = round2(ncPorCobranca?.[c.id] ?? 0);
                  const saldo = round2((c.valor_total ?? 0) - creditado);
                  const inv = invoiceByCobranca.get(c.id);
                  const porEmitir =
                    !c.documento_externo_ref &&
                    c.emite_fatura_fiscal &&
                    (c.estado === 'emitida' || c.estado === 'paga') &&
                    (c.valor_total ?? 0) > 0;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">
                        {c.documento_externo_ref ? (
                          <div className="flex items-center gap-1.5">
                            <span>{c.documento_externo_ref}</span>
                            {inv && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0"
                                title="Descarregar PDF"
                                onClick={() => baixarPdf(inv)}
                                disabled={baixandoId === c.id}
                              >
                                {baixandoId === c.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            )}
                          </div>
                        ) : porEmitir ? (
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            >
                              Por emitir
                            </Badge>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1"
                              onClick={() => reemitirFatura(c)}
                              disabled={reemitindoId === c.id}
                            >
                              {reemitindoId === c.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              Reemitir
                            </Button>
                          </div>
                        ) : (
                          c.id.slice(0, 8).toUpperCase()
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={c.destinatario_nome}>
                        {c.destinatario_nome}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(c.valor_total)}
                        {creditado > 0 && (
                          <span className="block text-[11px] font-normal text-fuchsia-600 dark:text-fuchsia-400">
                            − {formatCurrency(creditado)} creditado
                          </span>
                        )}
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
                      <TableCell className="text-right">
                        {creditado > 0 ? (
                          <span className="text-xs text-fuchsia-600 dark:text-fuchsia-400">
                            {saldo <= 0.005 ? 'Creditada' : 'Parcial'}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                });
              })()}
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
        emitente={emitente}
        onFaturado={refetchAll}
      />

      <NovaFaturaDialog
        open={novaFaturaOpen}
        onOpenChange={setNovaFaturaOpen}
        alvo={{
          tipo: 'contrato',
          id: contrato.id,
          orgId: contrato.org_id,
          codigoLabel: `Contrato #${String(contrato.codigo).padStart(4, '0')}`,
        }}
        destinatario={clienteEntidade}
        emitente={emitente}
        onCriada={refetchAll}
      />

      <AlertDialog
        open={anularOpen}
        onOpenChange={(o) => {
          if (!o && !anularBusy) setAnularOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular a faturação deste contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              O contrato volta a <b>"não faturado"</b> e fica re-faturável. Os lançamentos na
              conta-corrente (cobrança, recibos e notas de crédito) são estornados — o saldo fica a
              zero. Esta ação <b>não</b> emite Nota de Crédito nem cancela o documento fiscal no
              software de faturação; se já tiver sido emitido um documento certificado, faça a
              reversão fiscal (NC) separadamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={anularBusy}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                anularFaturacao();
              }}
              disabled={anularBusy}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {anularBusy ? 'A anular…' : 'Anular faturação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
