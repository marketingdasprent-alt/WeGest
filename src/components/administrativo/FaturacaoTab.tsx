import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, format } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import {
  Building2,
  CreditCard,
  Calendar as CalendarIcon,
  RefreshCw,
  FileSpreadsheet,
  Printer,
  X,
  Info,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
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
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  // ── dados ──
  const [rawMovimentos, setRawMovimentos] = useState<MovimentoRaw[]>([]);
  const [capped, setCapped] = useState(false);
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

  const stationSel = estacaoId !== TODAS;
  const metodoSel = metodo !== TODOS;
  const dateFrom = range?.from ? fmtDay(range.from) : null;
  const dateTo = range?.to ? fmtDay(range.to) : range?.from ? fmtDay(range.from) : null;

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

        const { data, error } = await supabase
          .from('conta_movimentos')
          .select(
            'valor, tipo, data_movimento, contrato:contratos_renting!conta_movimentos_contrato_id_fkey(estacao_entrega_id)'
          )
          .eq('origem', 'cobranca')
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
          const est: string | null = m.contrato?.estacao_entrega_id ?? null;

          // KPIs respeitam o filtro de estação selecionado
          if (stationSel && est !== estacaoId) return;
          if (d === todayStr) {
            k.hoje.valor += signed;
            if (isDebito) k.hoje.count += 1;
          }
          if (d === yStr) {
            k.ontem.valor += signed;
            if (isDebito) k.ontem.count += 1;
          }
          if (d >= wStartStr && d <= wEndStr) {
            k.semana.valor += signed;
            if (isDebito) k.semana.count += 1;
          }
          if (d >= mStartStr && d <= mEndStr) {
            k.mes.valor += signed;
            if (isDebito) k.mes.count += 1;
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

  const hasFilters = stationSel || metodoSel || !!range?.from;
  const limparFiltros = () => {
    setEstacaoId(TODAS);
    setMetodo(TODOS);
    setRange(undefined);
    setPage(1);
  };

  const dateLabel = range?.from
    ? range.to
      ? `${format(range.from, 'dd/MM/yy')} – ${format(range.to, 'dd/MM/yy')}`
      : format(range.from, 'dd/MM/yy')
    : 'Qualquer';

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

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <CalendarIcon className="h-4 w-4" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={range}
              onSelect={(r) => {
                setRange(r);
                setPage(1);
              }}
              numberOfMonths={2}
              locale={pt}
            />
          </PopoverContent>
        </Popover>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={limparFiltros}>
            <X className="h-4 w-4" />
            Limpar Filtros
          </Button>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {totalCount} {totalCount === 1 ? 'registo' : 'registos'}
          </span>
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Imprimir</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setReloadToken((t) => t + 1)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
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

      <FaturacaoMovimentoDialog row={selectedRow} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
