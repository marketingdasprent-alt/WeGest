import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  subWeeks,
  addWeeks,
  isThisWeek,
  format,
} from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Building2,
  CreditCard,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileSpreadsheet,
  Printer,
  X,
  Info,
  Banknote,
} from 'lucide-react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { useEstacoes } from '@/hooks/useEstacoes';
import { FaturacaoStats, type FaturacaoKpi } from './FaturacaoStats';
import { FaturacaoTabela } from './FaturacaoTabela';
import { FaturacaoMovimentoDialog } from './FaturacaoMovimentoDialog';
import {
  movimentoSelect,
  mergeMovimentosToRows,
  METODO_OPTIONS,
  metodoLabel,
  type MovimentoRaw,
  type FaturacaoRow,
} from './faturacao';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import type { InvoiceMetadata } from '@/types/faturacao';
import { RecibosDialog, type ReciboCobrancaAlvo } from '@/components/faturacao/RecibosDialog';
import {
  NotaCreditoDialog,
  type NotaCreditoCobranca,
} from '@/components/renting/contratos/NotaCreditoDialog';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import type { FaturacaoDocEmitente } from '@/utils/faturacaoDocumento';
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

const PAGE_SIZE = 50;
const WEEK_STARTS_ON = 1; // Segunda-feira
const EXPORT_CAP = 5000;
// Janela máxima carregada para a listagem. A consolidação Fatura-Recibo
// (cobrança+recibo numa só linha) tem de correr sobre a janela completa,
// por isso paginamos no cliente. Volume típico cabe folgado; acima disto,
// refina-se com o filtro de datas.
const LIST_CAP = 1000;
const TODAS = 'todas';
const TODOS = 'todos';

const fmtDay = (d: Date) => format(d, 'yyyy-MM-dd');
const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const emptyKpi = (dateLabel = ''): FaturacaoKpi => ({ valor: 0, count: 0, dateLabel });

// Atalhos rápidos para seleção de semanas — igual ao resumo
const getWeekShortcuts = () => [
  { label: 'Esta semana', date: new Date() },
  { label: 'Semana passada', date: subWeeks(new Date(), 1) },
  { label: 'Há 2 semanas', date: subWeeks(new Date(), 2) },
  { label: 'Há 3 semanas', date: subWeeks(new Date(), 3) },
];

/** Documentos fiscais de uma cobrança, por grupo de tipo. */
type InvoiceDocs = { ft?: InvoiceMetadata; nc?: InvoiceMetadata; rc?: InvoiceMetadata };

export function FaturacaoTab() {
  const { data: estacoes = [] } = useEstacoes();
  const estacoesMap = useMemo(() => {
    const m: Record<string, string> = {};
    estacoes.forEach((e) => (m[e.id] = e.nome));
    return m;
  }, [estacoes]);

  // ── filtros ──
  const [estacaoId, setEstacaoId] = useState<string>(TODAS);
  const [metodo, setMetodo] = useState<string>(TODOS);
  // Estado: data dentro da semana selecionada (default: semana passada)
  const [selectedWeek, setSelectedWeek] = useState<Date>(subWeeks(new Date(), 1));
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  // Semana selecionada: Segunda a Domingo (igual ao resumo)
  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const isCurrentWeek = isThisWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const weekShortcuts = getWeekShortcuts();
  const goToPreviousWeek = () => {
    setSelectedWeek((d) => subWeeks(d, 1));
    setPage(1);
  };
  const goToNextWeek = () => {
    setSelectedWeek((d) => addWeeks(d, 1));
    setPage(1);
  };
  const handleWeekDayClick = (day: Date | undefined) => {
    if (day) {
      setSelectedWeek(day);
      setPage(1);
    }
  };
  const selectWeekShortcut = (d: Date) => {
    setSelectedWeek(d);
    setPage(1);
  };
  const getWeekLabel = () => {
    const label = `${format(weekStart, 'dd/MM', { locale: pt })} - ${format(weekEnd, 'dd/MM/yyyy', { locale: pt })}`;
    return isCurrentWeek ? `${label} (Semana Actual)` : label;
  };

  // ── dados ──
  const [rawMovimentos, setRawMovimentos] = useState<MovimentoRaw[]>([]);
  const [capped, setCapped] = useState(false);
  // Documentos fiscais (FT/FR/NC/RC emitidos) por cobrança — p/ ver/descarregar.
  const [invoiceByCobranca, setInvoiceByCobranca] = useState<Map<string, InvoiceDocs>>(new Map());
  const [loading, setLoading] = useState(true);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  // espelho síncrono do mapa de perfis — evita closures obsoletas / refetch duplicado
  const profilesRef = useRef<Record<string, string>>({});

  const [kpis, setKpis] = useState({
    hoje: emptyKpi(),
    ontem: emptyKpi(),
    semana: emptyKpi(),
    mes: emptyKpi(),
  });
  const [loadingKpis, setLoadingKpis] = useState(true);

  // ── dialog de detalhe ──
  const [selectedRow, setSelectedRow] = useState<FaturacaoRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // ── ações de faturação (recibo / nota de crédito) sobre uma fatura ──
  const { empresas } = useClientesEmpresas();
  const emitente: FaturacaoDocEmitente | null = useMemo(
    () =>
      empresas.length === 1
        ? { nomeCompleto: empresas[0].nomeCompleto, nif: empresas[0].nif, sede: empresas[0].sede }
        : null,
    [empresas]
  );
  const [actionOrgId, setActionOrgId] = useState<string>('');
  const [reciboOpen, setReciboOpen] = useState(false);
  const [reciboAlvo, setReciboAlvo] = useState<ReciboCobrancaAlvo | null>(null);
  const [ncAlvo, setNcAlvo] = useState<NotaCreditoCobranca | null>(null);
  const [ncJaCreditado, setNcJaCreditado] = useState(0);
  const [ncMotivo, setNcMotivo] = useState<string>('');
  const [anularRow, setAnularRow] = useState<FaturacaoRow | null>(null);
  const [anularBusy, setAnularBusy] = useState(false);
  // Motivo da anulação — obrigatório ao anular um recibo (vai no aviso ao motorista).
  const [anularMotivo, setAnularMotivo] = useState('');

  /** Carrega a cobrança + saldos (recibos/NC ativos) para uma ação. */
  async function resolverCobranca(cobrancaId: string) {
    const { data: cob } = await supabase
      .from('contrato_cobrancas')
      .select(
        'id, org_id, descricao, valor_total, taxa_iva, emite_fatura_fiscal, estado, destinatario_id, destinatario_nome, contrato_id, documento_externo_ref'
      )
      .eq('id', cobrancaId)
      .single();
    if (!cob) return null;
    const { data: recs } = await supabase
      .from('recibos')
      .select('valor')
      .eq('referencia', cobrancaId)
      .eq('estado', 'ativo');
    const pago = (recs ?? []).reduce((s: number, r: any) => s + Number(r.valor || 0), 0);
    const { data: ncs } = await supabase
      .from('notas_credito')
      .select('valor')
      .eq('cobranca_id', cobrancaId)
      .eq('estado', 'ativo');
    const creditado = (ncs ?? []).reduce((s: number, n: any) => s + Number(n.valor || 0), 0);
    return { cob: cob as any, pago, creditado };
  }

  async function abrirReciboParaRow(row: FaturacaoRow) {
    if (!row.cobrancaId) return;
    setDialogOpen(false);
    const r = await resolverCobranca(row.cobrancaId);
    if (!r) {
      toast.error('Cobrança não encontrada.');
      return;
    }
    const total = Math.round((Number(r.cob.valor_total) || 0) * 100) / 100;
    const saldoPagar = Math.round((total - r.pago - r.creditado) * 100) / 100;
    if (saldoPagar <= 0.005) {
      toast.info('Esta fatura já está liquidada.');
      return;
    }
    setActionOrgId(r.cob.org_id);
    setReciboAlvo({
      id: r.cob.id,
      descricao: r.cob.descricao,
      valor_total: r.cob.valor_total,
      saldoPagar,
      destinatario_id: r.cob.destinatario_id,
      destinatario_nome: r.cob.destinatario_nome,
      contrato_id: r.cob.contrato_id,
      documento_externo_ref: r.cob.documento_externo_ref,
    });
    setReciboOpen(true);
  }

  async function abrirNcParaRow(row: FaturacaoRow, motivoPadrao = '') {
    if (!row.cobrancaId) return;
    setDialogOpen(false);
    const r = await resolverCobranca(row.cobrancaId);
    if (!r) {
      toast.error('Cobrança não encontrada.');
      return;
    }
    if (!r.cob.emite_fatura_fiscal) {
      toast.error('Cobrança interna não tem fatura a creditar.');
      return;
    }
    const total = Math.round((Number(r.cob.valor_total) || 0) * 100) / 100;
    const saldoCreditar = Math.round((total - r.creditado) * 100) / 100;
    if (saldoCreditar <= 0.005) {
      toast.info('Esta fatura já está totalmente creditada.');
      return;
    }
    setActionOrgId(r.cob.org_id);
    setNcJaCreditado(r.creditado);
    setNcMotivo(motivoPadrao);
    setNcAlvo({
      id: r.cob.id,
      descricao: r.cob.descricao,
      valor_total: r.cob.valor_total,
      taxa_iva: r.cob.taxa_iva,
      destinatario_id: r.cob.destinatario_id,
      destinatario_nome: r.cob.destinatario_nome,
      contrato_id: r.cob.contrato_id ?? null,
      documento_externo_ref: r.cob.documento_externo_ref,
    });
  }

  /**
   * Anular:
   *  - Fatura → reverte-se emitindo uma Nota de Crédito (o documento de reversão).
   *  - Recibo / NC → estorno interno na conta-corrente (sem documento — ver AlertDialog).
   */
  async function abrirAnular(row: FaturacaoRow) {
    if (row.docTipo === 'fatura') {
      const numero = row.numeroDoc && row.numeroDoc !== '—' ? row.numeroDoc : row.contratoLabel;
      await abrirNcParaRow(row, `Anulação da fatura ${numero}`.trim());
      return;
    }
    setDialogOpen(false);
    setAnularRow(row);
  }

  /** Anula o recibo / nota de crédito da linha (estorno interno na conta-corrente). */
  async function confirmarAnular() {
    const row = anularRow;
    if (!row) return;
    const motivo = anularMotivo.trim();
    // Motivo é obrigatório ao anular um recibo — segue no aviso ao motorista.
    if (row.docTipo === 'recibo' && !motivo) {
      toast.error('Indica o motivo da anulação.');
      return;
    }
    setAnularBusy(true);
    try {
      if (row.docTipo === 'recibo' && row.reciboId) {
        // Grava o motivo em observacoes: é o campo que o trigger lê para o aviso.
        const { error } = await supabase
          .from('recibos')
          .update({ estado: 'anulado', observacoes: motivo })
          .eq('id', row.reciboId)
          .eq('estado', 'ativo');
        if (error) throw error;
        // Se o recibo liquidava uma fatura, reabre a cobrança (paga → emitida).
        if (row.referencia) {
          await supabase
            .from('contrato_cobrancas')
            .update({ estado: 'emitida' })
            .eq('id', row.referencia)
            .eq('estado', 'paga');
        }
        toast.success('Recibo anulado (anulamento lançado na conta-corrente).');
      } else if (row.docTipo === 'nota_credito' && row.notaCreditoId) {
        const { error } = await supabase
          .from('notas_credito')
          .update({ estado: 'anulado' })
          .eq('id', row.notaCreditoId)
          .eq('estado', 'ativo');
        if (error) throw error;
        toast.success('Nota de crédito anulada (anulamento lançado na conta-corrente).');
      }
      setAnularRow(null);
      setAnularMotivo('');
      setReloadToken((t) => t + 1);
    } catch (e: any) {
      console.error('Erro ao anular:', e);
      toast.error(`Erro ao anular: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setAnularBusy(false);
    }
  }

  /** Documento fiscal associado à linha (fatura→FT/FR, NC→NC, recibo→RC). */
  function docFiscalDaLinha(row: FaturacaoRow | null): InvoiceMetadata | null {
    if (!row) return null;
    if (row.docTipo === 'fatura' || row.docTipo === 'fatura_recibo')
      return (row.cobrancaId && invoiceByCobranca.get(row.cobrancaId)?.ft) || null;
    if (row.docTipo === 'nota_credito')
      return (row.cobrancaId && invoiceByCobranca.get(row.cobrancaId)?.nc) || null;
    if (row.docTipo === 'recibo')
      return (row.referencia && invoiceByCobranca.get(row.referencia)?.rc) || null;
    return null;
  }

  const stationSel = estacaoId !== TODAS;
  const metodoSel = metodo !== TODOS;
  // A listagem e a repartição por estação filtram pela semana selecionada.
  const dateFrom = fmtDay(weekStart);
  const dateTo = fmtDay(weekEnd);

  // Resolve nomes de utilizadores (created_by → profiles.nome), em cache via ref.
  const resolveProfiles = useCallback(async (ids: Array<string | null>) => {
    const missing = Array.from(
      new Set(ids.filter((id): id is string => !!id && !(id in profilesRef.current)))
    );
    if (missing.length === 0) return;
    // marcar como pedidos (placeholder) para não voltar a procurar os mesmos ids
    missing.forEach((id) => {
      if (!(id in profilesRef.current)) profilesRef.current[id] = '—';
    });
    const { data } = await supabase.from('profiles').select('id, nome').in('id', missing);
    if (data && data.length) {
      const resolved: Record<string, string> = {};
      data.forEach((p: any) => {
        resolved[p.id] = p.nome || '—';
        profilesRef.current[p.id] = p.nome || '—';
      });
      setProfilesMap((prev) => ({ ...prev, ...resolved }));
    }
  }, []);

  // ── KPIs (faturas/cobranças emitidas) + repartição por estação ──
  useEffect(() => {
    let cancelled = false;
    async function loadKpis() {
      setLoadingKpis(true);
      try {
        const now = new Date();
        const todayStr = fmtDay(now);
        const yStr = fmtDay(subDays(now, 1));
        const wStart = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
        const wEnd = endOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
        const mStart = startOfMonth(now);
        const mEnd = endOfMonth(now);
        const wStartStr = fmtDay(wStart);
        const wEndStr = fmtDay(wEnd);
        const mStartStr = fmtDay(mStart);
        const mEndStr = fmtDay(mEnd);
        const windowStartStr = [mStartStr, wStartStr, yStr].sort()[0];

        // Faturado líquido: débitos de cobrança − estornos − notas de crédito.
        const { data, error } = await supabase
          .from('conta_movimentos')
          .select(
            'valor, tipo, origem, data_movimento, contrato:contratos_renting!conta_movimentos_contrato_id_fkey(estacao_entrega_id)'
          )
          .in('origem', ['cobranca', 'nota_credito'])
          .gte('data_movimento', windowStartStr);
        if (error) throw error;
        if (cancelled) return;

        const k = {
          hoje: emptyKpi(format(now, 'dd/MM')),
          ontem: emptyKpi(format(subDays(now, 1), 'dd/MM')),
          semana: emptyKpi(`${format(wStart, 'dd/MM')} – ${format(wEnd, 'dd/MM')}`),
          mes: emptyKpi(capitalize(format(now, 'MMMM', { locale: pt }))),
        };

        (data ?? []).forEach((m: any) => {
          const d: string = m.data_movimento;
          if (!d) return;
          const v = Number(m.valor) || 0;
          const isDebito = m.tipo === 'debito';
          const signed = isDebito ? v : -v;
          // Só um débito de cobrança conta como "fatura emitida" (exclui estornos de NC anulada).
          const isFatura = isDebito && m.origem === 'cobranca';
          const est: string | null = m.contrato?.estacao_entrega_id ?? null;

          // KPIs respeitam o filtro de estação selecionado
          if (stationSel && est !== estacaoId) return;
          if (d === todayStr) {
            k.hoje.valor += signed;
            if (isFatura) k.hoje.count += 1;
          }
          if (d === yStr) {
            k.ontem.valor += signed;
            if (isFatura) k.ontem.count += 1;
          }
          if (d >= wStartStr && d <= wEndStr) {
            k.semana.valor += signed;
            if (isFatura) k.semana.count += 1;
          }
          if (d >= mStartStr && d <= mEndStr) {
            k.mes.valor += signed;
            if (isFatura) k.mes.count += 1;
          }
        });

        setKpis(k);
      } catch (e) {
        console.error('Erro ao carregar KPIs de faturação:', e);
      } finally {
        if (!cancelled) setLoadingKpis(false);
      }
    }
    loadKpis();
    return () => {
      cancelled = true;
    };
  }, [estacaoId, stationSel, reloadToken]);

  // ── Janela de movimentos (consolidada + paginada no cliente) ──
  // O método de pagamento filtra-se no cliente (depois de consolidar), porque
  // um filtro por método em SQL deixaria de fora a cobrança da Fatura-Recibo.
  useEffect(() => {
    let cancelled = false;
    async function loadLedger() {
      setLoading(true);
      try {
        const sel = movimentoSelect({ contratoInner: stationSel });
        let q = supabase
          .from('conta_movimentos')
          .select(sel)
          .order('data_movimento', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(LIST_CAP + 1);
        if (stationSel) q = q.eq('contrato.estacao_entrega_id', estacaoId);
        if (dateFrom) q = q.gte('data_movimento', dateFrom);
        if (dateTo) q = q.lte('data_movimento', dateTo);

        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        const all = (data ?? []) as unknown as MovimentoRaw[];
        const raw = all.slice(0, LIST_CAP);
        setCapped(all.length > LIST_CAP);
        setRawMovimentos(raw);
        resolveProfiles(raw.map((m) => m.created_by));
      } catch (e) {
        console.error('Erro ao carregar lista de faturação:', e);
        toast.error('Erro ao carregar faturação');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadLedger();
    return () => {
      cancelled = true;
    };
    // resolveProfiles intentionally omitted (cache-stable enough; avoids refetch loop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estacaoId, stationSel, dateFrom, dateTo, reloadToken]);

  // ── Documentos fiscais das cobranças visíveis (p/ download PDF) ──
  useEffect(() => {
    let cancelled = false;
    async function loadInvoices() {
      // Cobranças das faturas + as cobranças liquidadas por recibos (referencia).
      const ids = Array.from(
        new Set(
          rawMovimentos
            .flatMap((m) => [m.cobranca_id, m.recibo?.referencia ?? null])
            .filter((x): x is string => !!x)
        )
      );
      if (ids.length === 0) {
        setInvoiceByCobranca(new Map());
        return;
      }
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('*')
        .in('cobranca_id', ids)
        .eq('status', 'emitida');
      if (error || cancelled) return;
      const m = new Map<string, InvoiceDocs>();
      for (const inv of (data ?? []) as InvoiceMetadata[]) {
        if (!inv.cobranca_id) continue;
        const slot = m.get(inv.cobranca_id) ?? {};
        const key: keyof InvoiceDocs = inv.tipo === 'NC' ? 'nc' : inv.tipo === 'RC' ? 'rc' : 'ft';
        const prev = slot[key];
        if (!prev || (inv.created_at ?? '') > (prev.created_at ?? '')) slot[key] = inv;
        m.set(inv.cobranca_id, slot);
      }
      if (!cancelled) setInvoiceByCobranca(m);
    }
    loadInvoices();
    return () => {
      cancelled = true;
    };
  }, [rawMovimentos]);

  // Documentos consolidados (Fatura-Recibo = 1 linha) — antes de paginar.
  const allDocs: FaturacaoRow[] = useMemo(
    () => mergeMovimentosToRows(rawMovimentos, estacoesMap, profilesMap),
    [rawMovimentos, estacoesMap, profilesMap]
  );

  // Filtro de método (cliente) + total/paginação derivados.
  const filteredDocs: FaturacaoRow[] = useMemo(
    () => (metodoSel ? allDocs.filter((d) => d.metodoRaw === metodo) : allDocs),
    [allDocs, metodoSel, metodo]
  );

  const totalCount = filteredDocs.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const rows: FaturacaoRow[] = useMemo(
    () => filteredDocs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredDocs, page]
  );

  // Recuar página se a lista encolher
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  // Âmbito atual dos KPIs (estação selecionada ou todas).
  const scopeLabel = stationSel ? estacoesMap[estacaoId] || 'Estação' : 'Todas as estações';

  const pageWindow = useMemo(() => {
    const maxButtons = 5;
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    const arr: number[] = [];
    for (let p = start; p <= end; p++) arr.push(p);
    return arr;
  }, [page, totalPages]);

  const goToPage = (p: number) => {
    if (p >= 1 && p <= totalPages) setPage(p);
  };

  const hasFilters = stationSel || metodoSel;
  const limparFiltros = () => {
    setEstacaoId(TODAS);
    setMetodo(TODOS);
    setPage(1);
  };

  const dateLabel = `${format(weekStart, 'dd/MM/yy')} – ${format(weekEnd, 'dd/MM/yy')}`;

  // ── Buscar todas as linhas filtradas (export / impressão) ──
  const fetchAllRows = useCallback(async (): Promise<FaturacaoRow[]> => {
    const sel = movimentoSelect({ contratoInner: stationSel });
    let q = supabase
      .from('conta_movimentos')
      .select(sel)
      .order('data_movimento', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(EXPORT_CAP);
    if (stationSel) q = q.eq('contrato.estacao_entrega_id', estacaoId);
    if (dateFrom) q = q.gte('data_movimento', dateFrom);
    if (dateTo) q = q.lte('data_movimento', dateTo);
    const { data, error } = await q;
    if (error) throw error;
    const raw = (data ?? []) as unknown as MovimentoRaw[];

    // resolver nomes de utilizadores que faltem (mapa local, sem depender do state)
    const ids = Array.from(new Set(raw.map((m) => m.created_by).filter((x): x is string => !!x)));
    const localProfiles: Record<string, string> = { ...profilesMap };
    const missing = ids.filter((id) => !(id in localProfiles));
    if (missing.length) {
      const { data: profs } = await supabase.from('profiles').select('id, nome').in('id', missing);
      (profs ?? []).forEach((p: any) => (localProfiles[p.id] = p.nome || '—'));
    }
    const docs = mergeMovimentosToRows(raw, estacoesMap, localProfiles);
    return metodoSel ? docs.filter((d) => d.metodoRaw === metodo) : docs;
  }, [stationSel, metodoSel, estacaoId, metodo, dateFrom, dateTo, estacoesMap, profilesMap]);

  const handleExportExcel = async () => {
    const toastId = toast.loading('A preparar exportação…');
    try {
      const all = await fetchAllRows();
      if (all.length === 0) {
        toast.error('Nada para exportar.', { id: toastId });
        return;
      }
      const header = [
        'ID',
        'Contrato',
        'Cliente',
        'Crédito',
        'Débito',
        'Descritivo',
        'Método Pagamento',
        'Estação',
        'Utilizador',
        'Data',
      ];
      const body = all.map((r) => [
        r.numeroDoc !== '—' ? r.numeroDoc : r.id.slice(0, 8).toUpperCase(),
        r.contratoLabel,
        r.clienteNome,
        r.credito ?? '',
        r.debito ?? '',
        r.descritivo,
        r.metodoLabel,
        r.estacaoNome,
        r.utilizador,
        formatDateTime(r.createdAt),
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      ws['!cols'] = [
        { wch: 12 },
        { wch: 10 },
        { wch: 26 },
        { wch: 12 },
        { wch: 12 },
        { wch: 34 },
        { wch: 20 },
        { wch: 16 },
        { wch: 18 },
        { wch: 18 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Faturação');
      XLSX.writeFile(wb, `faturacao_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
      if (all.length >= EXPORT_CAP) {
        toast.warning(
          `Exportados os primeiros ${EXPORT_CAP} movimentos (limite atingido) — refine os filtros.`,
          { id: toastId }
        );
      } else {
        toast.success(`${all.length} movimentos exportados.`, { id: toastId });
      }
    } catch (e) {
      console.error('Erro a exportar faturação:', e);
      toast.error('Erro ao exportar.', { id: toastId });
    }
  };

  const handlePrint = async () => {
    const toastId = toast.loading('A preparar impressão…');
    try {
      const all = await fetchAllRows();
      if (all.length === 0) {
        toast.error('Nada para imprimir.', { id: toastId });
        return;
      }
      const fmtEur = (v: number | null) => (v != null ? formatCurrency(v) : '');
      const totalCred = all.reduce((s, r) => s + (r.credito ?? 0), 0);
      const totalDeb = all.reduce((s, r) => s + (r.debito ?? 0), 0);
      const estLabel = stationSel ? estacoesMap[estacaoId] || '—' : 'Todas';
      const rowsHtml = all
        .map(
          (r) => `<tr>
        <td>${r.numeroDoc !== '—' ? r.numeroDoc : r.id.slice(0, 8).toUpperCase()}</td>
        <td>${r.contratoLabel}</td>
        <td>${r.clienteNome}</td>
        <td style="text-align:right;color:#059669">${fmtEur(r.credito)}</td>
        <td style="text-align:right">${fmtEur(r.debito)}</td>
        <td>${r.descritivo}</td>
        <td>${r.metodoLabel}</td>
        <td>${r.estacaoNome}</td>
        <td>${r.utilizador}</td>
        <td>${formatDateTime(r.createdAt)}</td>
      </tr>`
        )
        .join('');
      const w = window.open('', '_blank');
      if (!w) {
        toast.error('Pop-up bloqueado.', { id: toastId });
        return;
      }
      w.document
        .write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Faturação — WeGest</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:24px}
        h1{font-size:18px;margin-bottom:4px}
        .meta{font-size:10px;color:#6b7280;margin-bottom:12px}
        .stats{display:flex;gap:16px;margin-bottom:16px;font-size:12px}
        .stats b{display:block;font-size:15px}
        table{width:100%;border-collapse:collapse}
        th{background:#f9fafb;border-bottom:2px solid #d1d5db;padding:6px 8px;text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em;color:#374151}
        td{border-bottom:1px solid #f3f4f6;padding:6px 8px}
        tbody tr:nth-child(even){background:#f9fafb}
        @media print{body{padding:8px}@page{margin:10mm;size:landscape}}
      </style></head><body onload="window.print()">
      <h1>Faturação — Movimentos de Conta-Corrente</h1>
      <div class="meta">Estação: ${estLabel} · Método: ${metodoSel ? metodoLabel(metodo) : 'Todos'} · Período: ${dateLabel} · ${all.length} registos · Exportado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
      <div class="stats">
        <span>Crédito total<b style="color:#059669">${formatCurrency(totalCred)}</b></span>
        <span>Débito total<b>${formatCurrency(totalDeb)}</b></span>
      </div>
      <table><thead><tr>
        <th>ID</th><th>Contrato</th><th>Cliente</th><th style="text-align:right">Crédito</th>
        <th style="text-align:right">Débito</th><th>Descritivo</th><th>Método</th><th>Estação</th><th>Utilizador</th><th>Data</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table>
      </body></html>`);
      w.document.close();
      if (all.length >= EXPORT_CAP) {
        toast.warning(`Impressão limitada aos primeiros ${EXPORT_CAP} movimentos.`, {
          id: toastId,
        });
      } else {
        toast.success('Pronto para imprimir.', { id: toastId });
      }
    } catch (e) {
      console.error('Erro a imprimir faturação:', e);
      toast.error('Erro ao imprimir.', { id: toastId });
    }
  };

  const openRow = (row: FaturacaoRow) => {
    setSelectedRow(row);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <StickyPageHeader
        title="Faturação"
        description="Movimentos de conta-corrente e faturação dos contratos"
        icon={Banknote}
      >
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button variant="outline" onClick={handleExportExcel} className="w-full sm:w-auto">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
          <Button variant="outline" onClick={handlePrint} className="w-full sm:w-auto">
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
          <Button
            variant="outline"
            onClick={() => setReloadToken((t) => t + 1)}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </StickyPageHeader>

      <FaturacaoStats
        hoje={kpis.hoje}
        ontem={kpis.ontem}
        semana={kpis.semana}
        mes={kpis.mes}
        scopeLabel={scopeLabel}
        loading={loadingKpis}
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select
            value={estacaoId}
            onValueChange={(v) => {
              setEstacaoId(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Todas as estações" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as estações</SelectItem>
              {estacoes.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                  {e.cidade ? ` — ${e.cidade}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <Select
            value={metodo}
            onValueChange={(v) => {
              setMetodo(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Método" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os métodos</SelectItem>
              {METODO_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={goToPreviousWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 min-w-[210px] justify-center"
              >
                <CalendarIcon className="h-4 w-4" />
                {getWeekLabel()}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
              <div className="p-3 border-b">
                <div className="flex flex-wrap gap-1.5">
                  {weekShortcuts.map((shortcut) => (
                    <Button
                      key={shortcut.label}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => selectWeekShortcut(shortcut.date)}
                    >
                      {shortcut.label}
                    </Button>
                  ))}
                </div>
              </div>
              <Calendar
                initialFocus
                mode="single"
                defaultMonth={selectedWeek}
                selected={selectedWeek}
                onSelect={handleWeekDayClick}
                numberOfMonths={2}
                locale={pt}
                weekStartsOn={WEEK_STARTS_ON}
                className="pointer-events-auto"
                modifiers={{
                  selected: { from: weekStart, to: weekEnd },
                }}
                modifiersStyles={{
                  selected: {
                    backgroundColor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                    borderRadius: 0,
                  },
                }}
              />
              <div className="p-2 text-center text-xs text-muted-foreground border-t bg-muted/50">
                Clique num dia para selecionar a semana inteira (Seg-Dom)
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={goToNextWeek}
            disabled={isCurrentWeek}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={limparFiltros}>
            <X className="h-4 w-4" />
            Limpar Filtros
          </Button>
        )}

        <div className="ml-auto">
          <span className="text-sm text-muted-foreground">
            {totalCount} {totalCount === 1 ? 'registo' : 'registos'}
          </span>
        </div>
      </div>

      {capped && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Info className="h-3.5 w-3.5 shrink-0" />A mostrar os {LIST_CAP} registos mais recentes.
          Use o filtro de datas para ver períodos anteriores.
        </p>
      )}

      <FaturacaoTabela rows={rows} loading={loading} pageSize={PAGE_SIZE} onRowClick={openRow} />

      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-2">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => goToPage(page - 1)}
                  className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {pageWindow.map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink
                    isActive={p === page}
                    onClick={() => goToPage(p)}
                    className="cursor-pointer"
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  onClick={() => goToPage(page + 1)}
                  className={
                    page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </p>
        </div>
      )}

      <FaturacaoMovimentoDialog
        row={selectedRow}
        invoice={docFiscalDaLinha(selectedRow)}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onFazerRecibo={selectedRow ? () => abrirReciboParaRow(selectedRow) : undefined}
        onNotaCredito={selectedRow ? () => abrirNcParaRow(selectedRow) : undefined}
        onAnular={selectedRow ? () => abrirAnular(selectedRow) : undefined}
      />

      <RecibosDialog
        open={reciboOpen}
        onOpenChange={setReciboOpen}
        orgId={actionOrgId}
        cobrancas={reciboAlvo ? [reciboAlvo] : []}
        preselectId={reciboAlvo?.id}
        onEmitido={() => setReloadToken((t) => t + 1)}
      />

      <NotaCreditoDialog
        open={!!ncAlvo}
        onOpenChange={(o) => {
          if (!o) setNcAlvo(null);
        }}
        cobranca={ncAlvo}
        orgId={actionOrgId}
        emitente={emitente}
        jaCreditado={ncJaCreditado}
        defaultMotivo={ncMotivo}
        onEmitida={() => setReloadToken((t) => t + 1)}
      />

      <AlertDialog
        open={!!anularRow}
        onOpenChange={(o) => {
          if (!o && !anularBusy) {
            setAnularRow(null);
            setAnularMotivo('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {anularRow?.docTipo === 'recibo' ? 'Anular recibo?' : 'Anular nota de crédito?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {anularRow?.docTipo === 'recibo'
                ? 'Anula o recibo e lança um anulamento na conta-corrente. Um recibo anula-se internamente — não é emitido documento fiscal. O motorista é avisado por email com o motivo indicado.'
                : 'Anula a nota de crédito e lança um anulamento na conta-corrente. A reversão fiscal de uma NC seria uma Nota de Débito, que não é emitida aqui.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {anularRow?.docTipo === 'recibo' && (
            <div className="space-y-2">
              <Label htmlFor="anular-motivo">
                Motivo da anulação <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="anular-motivo"
                value={anularMotivo}
                onChange={(e) => setAnularMotivo(e.target.value)}
                placeholder="Ex.: pagamento devolvido pelo banco"
                className="min-h-[72px] resize-none"
                disabled={anularBusy}
                autoFocus
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={anularBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmarAnular();
              }}
              disabled={
                anularBusy || (anularRow?.docTipo === 'recibo' && !anularMotivo.trim())
              }
              className="bg-rose-600 hover:bg-rose-700"
            >
              {anularBusy ? 'A anular…' : 'Anular'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
