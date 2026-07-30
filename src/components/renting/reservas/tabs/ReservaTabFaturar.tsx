/**
 * Aba "Faturação" da reserva — permite faturar a reserva antecipadamente
 * (antes de abrir o contrato), fazer recibo e nota de crédito, e ver/descarregar
 * os documentos fiscais emitidos. As cobranças ficam ligadas à reserva
 * (reserva_id) e são herdadas pelo contrato na conversão.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Receipt, FileText, Download, Loader2, Send, RotateCcw, Mail } from 'lucide-react';
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
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import { useEmitirEEscreverFatura } from '@/hooks/useFaturacao';
import { baixarDocumentoPdf, clienteRowToFatura, anularCobrancasFaturacao } from '@/lib/faturacao';
import type { InvoiceMetadata, ItemFatura } from '@/types/faturacao';
import type { FaturacaoDocEmitente } from '@/utils/faturacaoDocumento';
import {
  FaturacaoActionsToolbar,
  type ToolbarCobranca,
} from '@/components/faturacao/FaturacaoActionsToolbar';
import { ReservaFaturarDialog } from '@/components/faturacao/ReservaFaturarDialog';
import { NovaFaturaDialog } from '@/components/faturacao/NovaFaturaDialog';
import { EnviarDocumentoEmailDialog } from '@/components/faturacao/EnviarDocumentoEmailDialog';
import { DocumentosEmitidosExtra } from '@/components/faturacao/DocumentosEmitidosExtra';
import {
  NotaCreditoDialog,
  type NotaCreditoCobranca,
} from '@/components/renting/contratos/NotaCreditoDialog';
import { useContactosDocumento } from '@/hooks/useContactosDocumento';
import { useReservaCondutores } from '@/hooks/useReservaCondutores';
import type { Reserva } from '@/types/reserva';
import { estadoCobrancaDisplay } from '@/lib/estadoCobranca';

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

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
  reserva: Reserva;
}

export function ReservaTabFaturar({ reserva }: Props) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [novaFaturaOpen, setNovaFaturaOpen] = useState(false);
  const [reemitindoId, setReemitindoId] = useState<string | null>(null);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const [anularOpen, setAnularOpen] = useState(false);
  const [anularBusy, setAnularBusy] = useState(false);
  // Proposta automática de NC logo a seguir a anular (mesmo motivo do
  // ContratoTabFaturar): só faz sentido para cobranças com documento fiscal
  // certificado, e é fácil esquecer de fazer isto à parte.
  const [ncAutoAlvo, setNcAutoAlvo] = useState<NotaCreditoCobranca | null>(null);
  const [enviarInvoice, setEnviarInvoice] = useState<InvoiceMetadata | null>(null);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const { empresas } = useClientesEmpresas();
  const emitente: FaturacaoDocEmitente | null = useMemo(() => {
    const e =
      empresas.find((x) => x.id === reserva.emissor_id) ??
      (empresas.length === 1 ? empresas[0] : null);
    return e ? { nomeCompleto: e.nomeCompleto, nif: e.nif, sede: e.sede } : null;
  }, [empresas, reserva.emissor_id]);

  const emitirMut = useEmitirEEscreverFatura();

  // Condutor principal (cliente OU motorista) — para pré-preencher o envio por email.
  const { data: reservaCondutores } = useReservaCondutores(reserva.id);
  const principalCond = useMemo(
    () => (reservaCondutores ?? []).find((c) => c.is_principal) ?? null,
    [reservaCondutores]
  );
  const { data: contactosEnvio = [] } = useContactosDocumento({
    clienteId: reserva.cliente_id,
    condutor: principalCond
      ? { cliente_id: principalCond.cliente_id, motorista_id: principalCond.motorista_id }
      : null,
  });

  const { data: cobrancas = [], refetch: refetchCobrancas } = useQuery({
    queryKey: ['reserva-cobrancas', reserva.id],
    queryFn: async (): Promise<CobrancaRow[]> => {
      const { data, error } = await supabase
        .from('contrato_cobrancas')
        .select(
          'id, documento_externo_ref, estado, valor_total, valor_sem_iva, taxa_iva, emite_fatura_fiscal, emitida_em, created_at, descricao, destinatario_id, destinatario_nome'
        )
        .eq('reserva_id', reserva.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('cobranças da reserva indisponíveis:', error.message);
        return [];
      }
      return (data ?? []) as CobrancaRow[];
    },
  });

  const cobrancaIds = useMemo(() => cobrancas.map((c) => c.id), [cobrancas]);

  // Busca-se TUDO (não só 'ativo') — os anulados também são precisos, para
  // tirar da lista "Notas de crédito e recibos" os documentos cujo registo
  // interno já foi anulado (mesmo achado do ContratoTabFaturar: a `invoices`
  // fiscal fica 'emitida' para sempre, mesmo depois de o recibo/NC ser
  // anulado). Os totais ativos continuam derivados só das linhas 'ativo'.
  const { data: notasCreditoRows = [], refetch: refetchNC } = useQuery({
    queryKey: ['reserva-notas-credito', reserva.id],
    queryFn: async (): Promise<
      Array<{
        cobranca_id: string;
        valor: number;
        estado: string;
        documento_externo_ref: string | null;
      }>
    > => {
      const { data, error } = await supabase
        .from('notas_credito')
        .select('cobranca_id, valor, estado, documento_externo_ref')
        .in(
          'cobranca_id',
          cobrancaIds.length ? cobrancaIds : ['00000000-0000-0000-0000-000000000000']
        );
      if (error) return [];
      return data ?? [];
    },
    enabled: cobrancaIds.length > 0,
  });

  const ncPorCobranca = useMemo(() => {
    const m: Record<string, number> = {};
    notasCreditoRows.forEach((n) => {
      if (n.estado === 'ativo') m[n.cobranca_id] = (m[n.cobranca_id] ?? 0) + Number(n.valor || 0);
    });
    return m;
  }, [notasCreditoRows]);

  const { data: recibosRows = [], refetch: refetchRecibos } = useQuery({
    queryKey: ['reserva-recibos', reserva.id],
    queryFn: async (): Promise<
      Array<{
        referencia: string | null;
        valor: number;
        estado: string;
        documento_externo_ref: string | null;
      }>
    > => {
      const { data, error } = await supabase
        .from('recibos')
        .select('referencia, valor, estado, documento_externo_ref')
        .in(
          'referencia',
          cobrancaIds.length ? cobrancaIds : ['00000000-0000-0000-0000-000000000000']
        );
      if (error) return [];
      return data ?? [];
    },
    enabled: cobrancaIds.length > 0,
  });

  const recibosPorCobranca = useMemo(() => {
    const m: Record<string, number> = {};
    recibosRows.forEach((r) => {
      if (r.estado === 'ativo' && r.referencia)
        m[r.referencia] = (m[r.referencia] ?? 0) + Number(r.valor || 0);
    });
    return m;
  }, [recibosRows]);

  const documentosAnuladosRefs = useMemo(() => {
    const set = new Set<string>();
    recibosRows.forEach((r) => {
      if (r.estado === 'anulado' && r.documento_externo_ref) set.add(r.documento_externo_ref);
    });
    notasCreditoRows.forEach((n) => {
      if (n.estado === 'anulado' && n.documento_externo_ref) set.add(n.documento_externo_ref);
    });
    return set;
  }, [recibosRows, notasCreditoRows]);

  const { data: invoices = [], refetch: refetchInvoices } = useQuery({
    queryKey: ['reserva-invoices', reserva.id],
    queryFn: async (): Promise<InvoiceMetadata[]> => {
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('*')
        .in(
          'cobranca_id',
          cobrancaIds.length ? cobrancaIds : ['00000000-0000-0000-0000-000000000000']
        );
      if (error) return [];
      return (data ?? []) as InvoiceMetadata[];
    },
    enabled: cobrancaIds.length > 0,
  });

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

  const refetchAll = () => {
    refetchCobrancas();
    refetchNC();
    refetchRecibos();
    refetchInvoices();
  };

  /**
   * Anula a faturação da reserva → volta a "não faturada" (re-faturável). Estorna
   * as cobranças/recibos/notas de crédito (saldo a zero). NÃO emite Nota de Crédito
   * nem cancela o documento fiscal no provider. O estado "faturada" da reserva é
   * derivado das cobranças ativas, por isso basta anulá-las.
   */
  async function anularFaturacao() {
    setAnularBusy(true);
    try {
      const ativas = cobrancas.filter((c) => c.estado === 'emitida' || c.estado === 'paga');
      const ativasIds = ativas.map((c) => c.id);
      await anularCobrancasFaturacao(ativasIds);

      const fiscaisAnuladas = ativas.filter((c) => c.emite_fatura_fiscal);
      toast.success(
        'Faturação anulada — a reserva voltou a "não faturada".',
        fiscaisAnuladas.length > 0
          ? {
              description:
                fiscaisAnuladas.length > 1
                  ? `${fiscaisAnuladas.length} tinham documento fiscal certificado. Isto abre a primeira — trata as restantes em Administrativo → Faturação.`
                  : 'Esta fatura tinha documento fiscal certificado — considera emitir a reversão fiscal (NC) no KeyInvoice.',
              action: {
                label: 'Emitir Nota de Crédito',
                onClick: () => {
                  const c = fiscaisAnuladas[0];
                  setNcAutoAlvo({
                    id: c.id,
                    descricao: c.descricao,
                    valor_total: c.valor_total,
                    taxa_iva: c.taxa_iva,
                    destinatario_id: c.destinatario_id,
                    destinatario_nome: c.destinatario_nome,
                    contrato_id: null,
                    documento_externo_ref: c.documento_externo_ref,
                  });
                },
              },
            }
          : undefined
      );
      setAnularOpen(false);
      qc.invalidateQueries({ queryKey: ['renting', 'reservas'] });
      refetchAll();
    } catch (e: any) {
      console.error('Erro ao anular faturação da reserva:', e);
      toast.error(`Erro ao anular faturação: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setAnularBusy(false);
    }
  }

  const toolbarCobrancas: ToolbarCobranca[] = useMemo(
    () =>
      cobrancas.map((c) => {
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
          contrato_id: null,
          documento_externo_ref: c.documento_externo_ref,
          emite_fatura_fiscal: c.emite_fatura_fiscal,
          estado: c.estado,
          saldoPagar: round2(total - pago - creditado),
          saldoCreditar: round2(total - creditado),
          jaCreditado: creditado,
        };
      }),
    [cobrancas, ncPorCobranca, recibosPorCobranca]
  );

  const jaFaturada = cobrancas.some((c) => c.estado === 'emitida' || c.estado === 'paga');

  const cobrancasVisiveis = useMemo(() => {
    const list = cobrancas.filter((c) => c.estado !== 'anulada');
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'documento_externo_ref') {
        va = a.documento_externo_ref || '';
        vb = b.documento_externo_ref || '';
      } else if (sortField === 'destinatario_nome') {
        va = a.destinatario_nome || '';
        vb = b.destinatario_nome || '';
      } else if (sortField === 'valor_total') {
        va = a.valor_total || 0;
        vb = b.valor_total || 0;
      } else if (sortField === 'estado') {
        va = a.estado || '';
        vb = b.estado || '';
      } else if (sortField === 'created_at') {
        va = a.emitida_em || a.created_at || '';
        vb = b.emitida_em || b.created_at || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [cobrancas, sortField, sortDir]);

  // Rent-a-Car: valor_total é SEM IVA — soma-se por cima para mostrar o total
  // a cobrar. TVDE: valor_total já é o total (com IVA), mostra-se tal e qual.
  const totalComIva =
    reserva.regime === 'rent_a_car'
      ? round2((reserva.valor_total ?? 0) * 1.23)
      : (reserva.valor_total ?? 0);

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

  async function reemitirFatura(c: CobrancaRow) {
    setReemitindoId(c.id);
    try {
      const { data: fresh } = await supabase
        .from('contrato_cobrancas')
        .select('documento_externo_ref')
        .eq('id', c.id)
        .single();
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
      const itens: ItemFatura[] = [
        {
          descricao: `Aluguer — Reserva #${reserva.codigo}`,
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
          cobranca_id: c.id,
          referencia_externa: `Reserva #${reserva.codigo}`,
        },
        cobrancaId: c.id,
        contratoId: reserva.id,
      });
      if (res.invoice) {
        try {
          await baixarDocumentoPdf(res.invoice);
        } catch {
          /* best-effort */
        }
      }
      toast.success(
        `Documento fiscal emitido${res.fullDocNumber ? ` (${res.fullDocNumber})` : ''}.`
      );
      if (res.warning) toast.warning(res.warning);
      refetchAll();
    } catch (e: any) {
      console.error('Erro a reemitir documento fiscal:', e);
      toast.error(`Falha a emitir o documento fiscal: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setReemitindoId(null);
    }
  }

  if (reserva.regime === 'slot') {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          As reservas em regime <strong>slot</strong> são faturadas via Contrato de Prestação.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {jaFaturada ? 'Reserva faturada' : 'Faturar reserva (pagamento antecipado)'}
              </p>
              <p className="text-xs text-muted-foreground">
                Total: <span className="font-semibold">{formatCurrency(totalComIva)}</span>
                {jaFaturada ? ' · já faturada' : ' · IVA incluído'}
              </p>
              {jaFaturada && (
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
            orgId={reserva.org_id}
            emitente={emitente}
            onFaturar={jaFaturada ? undefined : () => setDialogOpen(true)}
            faturarLabel="Faturar reserva"
            onNovaFatura={reserva.cliente_id ? () => setNovaFaturaOpen(true) : undefined}
            cobrancas={toolbarCobrancas}
            onChanged={refetchAll}
          />
        </CardContent>
      </Card>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Faturas da reserva
        </p>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  field="documento_externo_ref"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Nº / Ref.
                </SortableTableHead>
                <SortableTableHead
                  field="destinatario_nome"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Destinatário
                </SortableTableHead>
                <SortableTableHead
                  field="valor_total"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                >
                  Total
                </SortableTableHead>
                <SortableTableHead
                  field="estado"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Estado
                </SortableTableHead>
                <SortableTableHead
                  field="created_at"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Data
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const visiveis = cobrancasVisiveis;
                if (visiveis.length === 0)
                  return (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-20 text-center text-muted-foreground text-sm"
                      >
                        Ainda sem faturas para esta reserva.
                      </TableCell>
                    </TableRow>
                  );
                return visiveis.map((c) => {
                  const inv = invoiceByCobranca.get(c.id);
                  const creditado = round2(ncPorCobranca?.[c.id] ?? 0);
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
                              <>
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
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0"
                                  title="Enviar por email"
                                  onClick={() => setEnviarInvoice(inv)}
                                >
                                  <Mail className="h-3.5 w-3.5" />
                                </Button>
                              </>
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
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const est = estadoCobrancaDisplay(c.estado, c.valor_total, creditado);
                          return (
                            <Badge
                              variant="outline"
                              className={cn('capitalize border', est.className)}
                              title={
                                est.totalmenteCreditada
                                  ? 'Fatura integralmente regularizada por nota(s) de crédito. A fatura mantém-se emitida para efeitos fiscais.'
                                  : undefined
                              }
                            >
                              {est.label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(c.emitida_em || c.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                });
              })()}
            </TableBody>
          </Table>
        </div>
      </div>

      <DocumentosEmitidosExtra
        invoices={invoices.filter((inv) => !inv.numero || !documentosAnuladosRefs.has(inv.numero))}
        onEnviar={setEnviarInvoice}
      />

      <ReservaFaturarDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reserva={reserva}
        emitente={emitente}
        onFaturado={refetchAll}
      />

      <EnviarDocumentoEmailDialog
        open={!!enviarInvoice}
        onOpenChange={(o) => {
          if (!o) setEnviarInvoice(null);
        }}
        invoice={enviarInvoice}
        contextoLabel={`Reserva #${reserva.codigo}`}
        entidades={contactosEnvio}
      />

      {reserva.cliente_id && (
        <NovaFaturaDialog
          open={novaFaturaOpen}
          onOpenChange={setNovaFaturaOpen}
          alvo={{
            tipo: 'reserva',
            id: reserva.id,
            orgId: reserva.org_id,
            codigoLabel: `Reserva #${reserva.codigo}`,
          }}
          destinatario={{ id: reserva.cliente_id, nome: reserva.cliente_nome ?? 'Cliente' }}
          emitente={emitente}
          onCriada={refetchAll}
        />
      )}

      <NotaCreditoDialog
        open={!!ncAutoAlvo}
        onOpenChange={(o) => {
          if (!o) setNcAutoAlvo(null);
        }}
        cobranca={ncAutoAlvo}
        orgId={reserva.org_id}
        emitente={emitente}
        jaCreditado={ncAutoAlvo ? (ncPorCobranca[ncAutoAlvo.id] ?? 0) : 0}
        defaultMotivo={
          ncAutoAlvo
            ? `Anulação da fatura ${ncAutoAlvo.documento_externo_ref ?? ''}`.trim()
            : undefined
        }
        onEmitida={refetchAll}
      />

      <AlertDialog
        open={anularOpen}
        onOpenChange={(o) => {
          if (!o && !anularBusy) setAnularOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular a faturação desta reserva?</AlertDialogTitle>
            <AlertDialogDescription>
              A reserva volta a <b>"não faturada"</b> e fica re-faturável. Os lançamentos na
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
