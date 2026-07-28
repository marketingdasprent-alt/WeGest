import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { RefreshCw, FileSpreadsheet, Printer, Banknote } from 'lucide-react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { FinanceiroSection } from '@/components/ui/financeiro-section';
import { Button } from '@/components/ui/button';
import { useEstacoes } from '@/hooks/useEstacoes';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import {
  movimentoSelect,
  mergeMovimentosToRows,
  metodoLabel,
  type MovimentoRaw,
  type FaturacaoRow,
} from './faturacao';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import { fmtDay, capitalize, emptyResumo, getWeekShortcuts } from '@/utils/financeiro';
import type { InvoiceMetadata } from '@/types/faturacao';
import type { FaturacaoDocEmitente } from '@/utils/faturacaoDocumento';
import type { ReciboCobrancaAlvo } from '@/components/faturacao/RecibosDialog';
import type { NotaCreditoCobranca } from '@/components/renting/contratos/NotaCreditoDialog';
import {
  ParcelamentoDialog,
  type ParcelamentoFaturaAlvo,
} from '@/components/faturacao/ParcelamentoDialog';
import { useAcordoAtivoPorCobranca } from '@/hooks/useAcordosPagamento';
import { FaturacaoToolbarSection } from './faturacao/sections/FaturacaoToolbarSection';
import { FaturacaoListaSection } from './faturacao/sections/FaturacaoListaSection';
import { FaturacaoDialogsSection } from './faturacao/sections/FaturacaoDialogsSection';
import { FaturacaoAlertasSection } from './faturacao/sections/FaturacaoAlertasSection';

const PAGE_SIZE = 50,
  WEEK_STARTS_ON = 1,
  EXPORT_CAP = 5000,
  LIST_CAP = 1000,
  TODAS = 'todas',
  TODOS = 'todos';
const getWeekShortcutButtons = () => getWeekShortcuts();
const emptyKpi = (dl = '') => emptyResumo(dl);

type InvoiceDocs = { ft?: InvoiceMetadata; nc?: InvoiceMetadata; rc?: InvoiceMetadata };

export function FaturacaoContent() {
  const navigate = useNavigate();
  const { data: estacoes = [] } = useEstacoes();
  const estacoesMap = useMemo(() => {
    const m: Record<string, string> = {};
    estacoes.forEach((e) => (m[e.id] = e.nome));
    return m;
  }, [estacoes]);

  const [estacaoId, setEstacaoId] = useState<string>(TODAS);
  const [metodo, setMetodo] = useState<string>(TODOS);
  const [selectedWeek, setSelectedWeek] = useState<Date>(subWeeks(new Date(), 1));
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const isCurrentWeek = isThisWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const weekShortcuts = getWeekShortcutButtons();
  const goToPreviousWeek = () => {
    setSelectedWeek((d) => subWeeks(d, 1));
    setPage(1);
  };
  const goToNextWeek = () => {
    setSelectedWeek((d) => addWeeks(d, 1));
    setPage(1);
  };
  const handleWeekDayClick = (day?: Date) => {
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
    const l = `${format(weekStart, 'dd/MM')} - ${format(weekEnd, 'dd/MM/yyyy')}`;
    return isCurrentWeek ? `${l} (Semana Actual)` : l;
  };

  const [rawMovimentos, setRawMovimentos] = useState<MovimentoRaw[]>([]);
  const [capped, setCapped] = useState(false);
  const [invoiceByCobranca, setInvoiceByCobranca] = useState<Map<string, InvoiceDocs>>(new Map());
  const [loading, setLoading] = useState(true);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const profilesRef = useRef<Record<string, string>>({});

  const [kpis, setKpis] = useState({
    hoje: emptyKpi(),
    ontem: emptyKpi(),
    semana: emptyKpi(),
    mes: emptyKpi(),
  });
  const [loadingKpis, setLoadingKpis] = useState(true);

  const [selectedRow, setSelectedRow] = useState<FaturacaoRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { empresas } = useClientesEmpresas();
  const emitente: FaturacaoDocEmitente | null = useMemo(
    () =>
      empresas.length === 1
        ? { nomeCompleto: empresas[0].nomeCompleto, nif: empresas[0].nif, sede: empresas[0].sede }
        : null,
    [empresas]
  );
  const [actionOrgId, setActionOrgId] = useState('');
  const [reciboOpen, setReciboOpen] = useState(false);
  const [reciboAlvo, setReciboAlvo] = useState<ReciboCobrancaAlvo | null>(null);
  const [ncAlvo, setNcAlvo] = useState<NotaCreditoCobranca | null>(null);
  const [ncJaCreditado, setNcJaCreditado] = useState(0);
  const [ncMotivo, setNcMotivo] = useState('');
  const [anularRow, setAnularRow] = useState<FaturacaoRow | null>(null);
  const [anularBusy, setAnularBusy] = useState(false);
  const [anularMotivo, setAnularMotivo] = useState('');
  const [parcelamentoAlvo, setParcelamentoAlvo] = useState<ParcelamentoFaturaAlvo | null>(null);
  // Decide se o botão de parcelamento abre o ParcelamentoDialog (sem acordo vivo)
  // ou navega para o acordo já existente (useAcordoAtivoPorCobranca, Fase 4A).
  const { data: acordoAtivo } = useAcordoAtivoPorCobranca(selectedRow?.cobrancaId ?? null);

  async function resolverCobranca(cobrancaId: string) {
    const { data: cob } = await supabase
      .from('contrato_cobrancas')
      .select(
        'id,org_id,descricao,valor_total,taxa_iva,emite_fatura_fiscal,estado,destinatario_id,destinatario_nome,contrato_id,documento_externo_ref'
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

  async function abrirParcelarParaRow(row: FaturacaoRow) {
    if (!row.cobrancaId) return;
    const invoice = docFiscalDaLinha(row);
    if (!invoice || invoice.tipo !== 'FT') {
      toast.error('Só é possível parcelar uma Factura (FT) por liquidar.');
      return;
    }
    setDialogOpen(false);
    const r = await resolverCobranca(row.cobrancaId);
    if (!r) {
      toast.error('Cobrança não encontrada.');
      return;
    }
    const total = Math.round((Number(r.cob.valor_total) || 0) * 100) / 100;
    // Mesma fórmula que abrirReciboParaRow: total − recibos ativos − NC ativas.
    const saldoPagar = Math.round((total - r.pago - r.creditado) * 100) / 100;
    if (saldoPagar <= 0.005) {
      toast.info('Esta fatura já está liquidada.');
      return;
    }
    setParcelamentoAlvo({
      cobrancaId: r.cob.id,
      contratoId: r.cob.contrato_id,
      numeroDocumento: r.cob.documento_externo_ref || row.numeroDoc || '',
      // `invoice` (não `invoice?.`): o gate acima já devolveu se `invoice` fosse
      // null — chegado aqui está sempre definido (é uma const, nunca reatribuído).
      dataDocumento: invoice.data_emissao || row.dataMovimento || '',
      valorTotal: total,
      saldoPagar,
      titularId: r.cob.destinatario_id,
      titularNome: r.cob.destinatario_nome,
      titularNif: invoice.cliente_nif ?? null,
    });
  }

  async function abrirAnular(row: FaturacaoRow) {
    if (row.docTipo === 'fatura') {
      await abrirNcParaRow(
        row,
        `Anulação da fatura ${row.numeroDoc !== '—' ? row.numeroDoc : row.contratoLabel}`.trim()
      );
      return;
    }
    setDialogOpen(false);
    setAnularRow(row);
  }

  async function confirmarAnular() {
    const row = anularRow;
    if (!row) return;
    const motivo = anularMotivo.trim();
    if (!motivo) {
      toast.error('Indica o motivo da anulação.');
      return;
    }
    setAnularBusy(true);
    try {
      if (row.docTipo === 'recibo' && row.reciboId) {
        const { error } = await supabase
          .from('recibos')
          .update({ estado: 'anulado', observacoes: motivo })
          .eq('id', row.reciboId)
          .eq('estado', 'ativo');
        if (error) throw error;
        if (row.referencia)
          await supabase
            .from('contrato_cobrancas')
            .update({ estado: 'emitida' })
            .eq('id', row.referencia)
            .eq('estado', 'paga');
        toast.success('Recibo anulado (anulamento lançado na conta-corrente).');
      } else if (row.docTipo === 'nota_credito' && row.notaCreditoId) {
        const { data: ncAtual } = await supabase
          .from('notas_credito')
          .select('motivo')
          .eq('id', row.notaCreditoId)
          .single();
        const motivoFinal = (ncAtual?.motivo ?? '').trim()
          ? `${(ncAtual?.motivo ?? '').trim()} | Anulada: ${motivo}`
          : `Anulada: ${motivo}`;
        const { error } = await supabase
          .from('notas_credito')
          .update({ estado: 'anulado', motivo: motivoFinal })
          .eq('id', row.notaCreditoId);
        if (error) throw error;
        toast.success('Nota de crédito anulada (anulamento lançado na conta-corrente).');
      }
      setReloadToken((t) => t + 1);
    } catch (e: any) {
      console.error('Erro ao anular:', e);
      toast.error(`Erro ao anular: ${e?.message ?? 'tente novamente'}`);
    } finally {
      setAnularBusy(false);
    }
  }

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
  const dateFrom = fmtDay(weekStart);
  const dateTo = fmtDay(weekEnd);

  const resolveProfiles = useCallback(async (ids: Array<string | null>) => {
    const missing = Array.from(
      new Set(ids.filter((id): id is string => !!id && !(id in profilesRef.current)))
    );
    if (!missing.length) return;
    missing.forEach((id) => {
      if (!(id in profilesRef.current)) profilesRef.current[id] = '—';
    });
    const { data } = await supabase.from('profiles').select('id, nome').in('id', missing);
    if (data?.length) {
      const r: Record<string, string> = {};
      data.forEach((p: any) => {
        r[p.id] = p.nome || '—';
        profilesRef.current[p.id] = p.nome || '—';
      });
      setProfilesMap((prev) => ({ ...prev, ...r }));
    }
  }, []);

  // ── KPIs ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingKpis(true);
      try {
        const now = new Date(),
          todayStr = fmtDay(now),
          yStr = fmtDay(subDays(now, 1));
        const wS = fmtDay(startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON })),
          wE = fmtDay(endOfWeek(now, { weekStartsOn: WEEK_STARTS_ON }));
        const mS = fmtDay(startOfMonth(now)),
          mE = fmtDay(endOfMonth(now));
        const { data, error } = await supabase
          .from('conta_movimentos')
          .select(
            'valor,tipo,origem,data_movimento,contrato:contratos_renting!conta_movimentos_contrato_id_fkey(estacao_entrega_id)'
          )
          .in('origem', ['cobranca', 'nota_credito'])
          .gte('data_movimento', [mS, wS, yStr].sort()[0]);
        if (error || cancelled) return;
        const k = {
          hoje: emptyKpi(format(now, 'dd/MM')),
          ontem: emptyKpi(format(subDays(now, 1), 'dd/MM')),
          semana: emptyKpi(`${format(wS, 'dd/MM')} – ${format(wE, 'dd/MM')}`),
          mes: emptyKpi(capitalize(format(now, 'MMMM', { locale: pt }))),
        };
        (data ?? []).forEach((m: any) => {
          const d = m.data_movimento;
          if (!d) return;
          const v = Number(m.valor) || 0,
            signed = m.tipo === 'debito' ? v : -v,
            isF = m.tipo === 'debito' && m.origem === 'cobranca';
          const est = m.contrato?.estacao_entrega_id ?? null;
          if (stationSel && est !== estacaoId) return;
          if (d === todayStr) {
            k.hoje.valor += signed;
            if (isF) k.hoje.count += 1;
          }
          if (d === yStr) {
            k.ontem.valor += signed;
            if (isF) k.ontem.count += 1;
          }
          if (d >= wS && d <= wE) {
            k.semana.valor += signed;
            if (isF) k.semana.count += 1;
          }
          if (d >= mS && d <= mE) {
            k.mes.valor += signed;
            if (isF) k.mes.count += 1;
          }
        });
        if (!cancelled) setKpis(k);
      } catch (e) {
        console.error('Erro ao carregar KPIs:', e);
      } finally {
        if (!cancelled) setLoadingKpis(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estacaoId, stationSel, reloadToken]);

  // ── Movimentos ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let q = supabase
          .from('conta_movimentos')
          .select(movimentoSelect({ contratoInner: stationSel }))
          .order('data_movimento', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(LIST_CAP);
        if (stationSel) q = q.eq('contrato.estacao_entrega_id', estacaoId);
        if (dateFrom) q = q.gte('data_movimento', dateFrom);
        if (dateTo) q = q.lte('data_movimento', dateTo);
        const { data, error } = await q;
        if (error || cancelled) return;
        const all = (data ?? []) as unknown as MovimentoRaw[];
        setCapped(all.length > LIST_CAP);
        setRawMovimentos(all);
        resolveProfiles(all.map((m) => m.created_by));
      } catch (e) {
        console.error('Erro ao carregar lista:', e);
        toast.error('Erro ao carregar faturação');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estacaoId, stationSel, dateFrom, dateTo, reloadToken]);

  // ── Documentos fiscais ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = Array.from(
        new Set(
          rawMovimentos
            .flatMap((m) => [m.cobranca_id, m.recibo?.referencia ?? null])
            .filter((x): x is string => !!x)
        )
      );
      if (!ids.length) {
        if (!cancelled) setInvoiceByCobranca(new Map());
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
    })();
    return () => {
      cancelled = true;
    };
  }, [rawMovimentos]);

  const allDocs = useMemo(
    () => mergeMovimentosToRows(rawMovimentos, estacoesMap, profilesMap),
    [rawMovimentos, estacoesMap, profilesMap]
  );
  const filteredDocs = useMemo(
    () => (metodoSel ? allDocs.filter((d) => d.metodoRaw === metodo) : allDocs),
    [allDocs, metodoSel, metodo]
  );
  const totalCount = filteredDocs.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rows = useMemo(
    () => filteredDocs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredDocs, page]
  );
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const scopeLabel = stationSel ? estacoesMap[estacaoId] || 'Estação' : 'Todas as estações';

  const pageWindow = useMemo(() => {
    const maxB = 5;
    let s = Math.max(1, page - 2);
    const e = Math.min(totalPages, s + maxB - 1);
    s = Math.max(1, e - maxB + 1);
    const a: number[] = [];
    for (let p = s; p <= e; p++) a.push(p);
    return a;
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

  const fetchAllRows = useCallback(async (): Promise<FaturacaoRow[]> => {
    let q = supabase
      .from('conta_movimentos')
      .select(movimentoSelect({ contratoInner: stationSel }))
      .order('data_movimento', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(EXPORT_CAP);
    if (stationSel) q = q.eq('contrato.estacao_entrega_id', estacaoId);
    if (dateFrom) q = q.gte('data_movimento', dateFrom);
    if (dateTo) q = q.lte('data_movimento', dateTo);
    const { data, error } = await q;
    if (error) throw error;
    const raw = (data ?? []) as unknown as MovimentoRaw[];
    const ids = Array.from(new Set(raw.map((m) => m.created_by).filter((x): x is string => !!x)));
    const lp: Record<string, string> = { ...profilesMap };
    const missing = ids.filter((id) => !(id in lp));
    if (missing.length) {
      const { data: profs } = await supabase.from('profiles').select('id, nome').in('id', missing);
      (profs ?? []).forEach((p: any) => (lp[p.id] = p.nome || '—'));
    }
    const docs = mergeMovimentosToRows(raw, estacoesMap, lp);
    return metodoSel ? docs.filter((d) => d.metodoRaw === metodo) : docs;
  }, [estacaoId, stationSel, dateFrom, dateTo, metodo, metodoSel, estacoesMap, profilesMap]);

  const handleExportExcel = async () => {
    const tid = toast.loading('A exportar…');
    try {
      const all = await fetchAllRows();
      if (!all.length) {
        toast.error('Nada para exportar.', { id: tid });
        return;
      }
      const ws = XLSX.utils.json_to_sheet(
        all.map((r) => ({
          ID: r.numeroDoc !== '—' ? r.numeroDoc : r.id.slice(0, 8).toUpperCase(),
          Contrato: r.contratoLabel,
          Cliente: r.clienteNome,
          Crédito: r.credito ?? 0,
          Débito: r.debito ?? 0,
          Descritivo: r.descritivo,
          'Método Pagamento': r.metodoLabel,
          Estação: r.estacaoNome,
          Utilizador: r.utilizador,
          Data: formatDateTime(r.createdAt),
        }))
      );
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
      toast.success(
        all.length >= EXPORT_CAP
          ? `Exportados os primeiros ${EXPORT_CAP} movimentos.`
          : `${all.length} movimentos exportados.`,
        { id: tid }
      );
    } catch (e) {
      console.error('Erro a exportar:', e);
      toast.error('Erro ao exportar.', { id: tid });
    }
  };

  const handlePrint = async () => {
    const tid = toast.loading('A preparar impressão…');
    try {
      const all = await fetchAllRows();
      if (!all.length) {
        toast.error('Nada para imprimir.', { id: tid });
        return;
      }
      const tCred = all.reduce((s, r) => s + (r.credito ?? 0), 0),
        tDeb = all.reduce((s, r) => s + (r.debito ?? 0), 0);
      const estLbl = stationSel ? estacoesMap[estacaoId] || '—' : 'Todas';
      const rHtml = all
        .map(
          (r) => `<tr>
        <td>${r.numeroDoc !== '—' ? r.numeroDoc : r.id.slice(0, 8).toUpperCase()}</td>
        <td>${r.contratoLabel}</td><td>${r.clienteNome}</td>
        <td style="text-align:right;color:#059669">${formatCurrency(r.credito)}</td>
        <td style="text-align:right">${formatCurrency(r.debito)}</td>
        <td>${r.descritivo}</td><td>${r.metodoLabel}</td>
        <td>${r.estacaoNome}</td><td>${r.utilizador}</td>
        <td>${formatDateTime(r.createdAt)}</td></tr>`
        )
        .join('');
      const w = window.open('', '_blank');
      if (!w) {
        toast.error('Pop-up bloqueado.', { id: tid });
        return;
      }
      w.document
        .write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Faturação — WeGest</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:24px}
        h1{font-size:18px;margin-bottom:4px}.meta{font-size:10px;color:#6b7280;margin-bottom:12px}
        .stats{display:flex;gap:16px;margin-bottom:16px;font-size:12px}.stats b{display:block;font-size:15px}
        table{width:100%;border-collapse:collapse}
        th{background:#f9fafb;border-bottom:2px solid #d1d5db;padding:6px 8px;text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em;color:#374151}
        td{border-bottom:1px solid #f3f4f6;padding:6px 8px}
        tbody tr:nth-child(even){background:#f9fafb}
        @media print{body{padding:8px}@page{margin:10mm;size:landscape}}
      </style></head><body onload="window.print()">
      <h1>Faturação — Movimentos de Conta-Corrente</h1>
      <div class="meta">Estação: ${estLbl} · Período: ${fmtDay(weekStart)} – ${fmtDay(weekEnd)} · ${all.length} registos</div>
      <div class="stats"><span>Crédito total<b style="color:#059669">${formatCurrency(tCred)}</b></span><span>Débito total<b>${formatCurrency(tDeb)}</b></span></div>
      <table><thead><tr><th>ID</th><th>Contrato</th><th>Cliente</th><th style="text-align:right">Crédito</th>
      <th style="text-align:right">Débito</th><th>Descritivo</th><th>Método</th><th>Estação</th><th>Utilizador</th><th>Data</th>
      </tr></thead><tbody>${rHtml}</tbody></table></body></html>`);
      w.document.close();
      toast.success('Pronto para imprimir.', { id: tid });
    } catch (e) {
      console.error('Erro a imprimir:', e);
      toast.error('Erro ao imprimir.', { id: tid });
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
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
          <Button variant="outline" onClick={handlePrint} className="w-full sm:w-auto">
            <Printer className="mr-2 h-4 w-4" /> Imprimir
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setReloadToken((t) => t + 1)}
            title="Recarregar"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <FaturacaoToolbarSection
          estacoes={estacoes}
          estacaoId={estacaoId}
          onEstacaoChange={(v) => {
            setEstacaoId(v);
            setPage(1);
          }}
          metodo={metodo}
          onMetodoChange={(v) => {
            setMetodo(v);
            setPage(1);
          }}
          weekStart={weekStart}
          weekEnd={weekEnd}
          selectedWeek={selectedWeek}
          isCurrentWeek={isCurrentWeek}
          onPreviousWeek={goToPreviousWeek}
          onNextWeek={goToNextWeek}
          onWeekDayClick={handleWeekDayClick}
          onWeekShortcut={selectWeekShortcut}
          getWeekLabel={getWeekLabel}
          weekShortcuts={weekShortcuts}
          weekStartsOn={WEEK_STARTS_ON}
          hasFilters={hasFilters}
          onLimparFiltros={limparFiltros}
          totalCount={totalCount}
          TODAS={TODAS}
          TODOS={TODOS}
        />
      </StickyPageHeader>

      <FaturacaoListaSection
        rows={rows}
        loading={loading}
        pageSize={PAGE_SIZE}
        page={page}
        totalPages={totalPages}
        pageWindow={pageWindow}
        capped={capped}
        listCap={LIST_CAP}
        onRowClick={openRow}
        goToPage={goToPage}
      />

      <FaturacaoDialogsSection
        selectedRow={selectedRow}
        invoice={docFiscalDaLinha(selectedRow)}
        dialogOpen={dialogOpen}
        onDialogOpenChange={setDialogOpen}
        onFazerRecibo={selectedRow ? () => abrirReciboParaRow(selectedRow) : undefined}
        onNotaCredito={selectedRow ? () => abrirNcParaRow(selectedRow) : undefined}
        onParcelar={
          selectedRow
            ? acordoAtivo
              ? () => navigate(`/acordos/${acordoAtivo.id}`)
              : () => abrirParcelarParaRow(selectedRow)
            : undefined
        }
        parcelarLabel={acordoAtivo ? 'Ver plano de pagamentos' : 'Parcelar'}
        onAnular={selectedRow ? () => abrirAnular(selectedRow) : undefined}
        reciboOpen={reciboOpen}
        onReciboOpenChange={setReciboOpen}
        actionOrgId={actionOrgId}
        reciboAlvo={reciboAlvo}
        onReciboEmitido={() => setReloadToken((t) => t + 1)}
        ncAlvo={ncAlvo}
        onNcOpenChange={(o) => {
          if (!o) setNcAlvo(null);
        }}
        emitente={emitente}
        ncJaCreditado={ncJaCreditado}
        ncMotivo={ncMotivo}
        onNcEmitida={() => setReloadToken((t) => t + 1)}
        anularRow={anularRow}
        onAnularOpenChange={() => {
          if (!anularBusy) {
            setAnularRow(null);
            setAnularMotivo('');
          }
        }}
      />

      <ParcelamentoDialog
        open={!!parcelamentoAlvo}
        onOpenChange={(o) => {
          if (!o) setParcelamentoAlvo(null);
        }}
        alvo={parcelamentoAlvo}
        onCriado={() => setReloadToken((t) => t + 1)}
      />

      <FaturacaoAlertasSection
        anularRow={anularRow}
        anularMotivo={anularMotivo}
        anularBusy={anularBusy}
        onAnularMotivoChange={setAnularMotivo}
        onConfirmarAnular={confirmarAnular}
        onOpenChange={() => {
          if (!anularBusy) {
            setAnularRow(null);
            setAnularMotivo('');
          }
        }}
      />
    </div>
  );
}

/**
 * Wrapper público — mantém a API original (<FaturacaoTab />) para páginas
 * que já a importam. Delega para o componente partilhado FinanceiroSection.
 */
export function FaturacaoTab() {
  return <FinanceiroSection entidade="global" />;
}
