import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  useCartoesFrotaLista,
  useMotoristasParaCartoes,
  useGuardarCartaoFrota,
  useEliminarCartaoFrota,
  useImportarCartoesFrota,
} from '@/hooks/useCartoesFrota';
import { errorMessage } from '@/utils/errorMessage';
import { useToast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/usePagination';
import {
  STATUS_ORDER,
  emptyForm,
  todayISO,
  norm,
  type CartaoFrota,
  type MotoristaOption,
  type HistoricoItem,
  type StatusCartao,
  type FormState,
  type Movimento,
} from './cartoesFlotaTab.types';
import { parseSheet, readWorkbook } from './cartoesFlotaImport';
import type { ImportRow, TipoCartao } from './cartoesFlotaImport';
import { exportarCartoesExcel, exportarCartoesPrint } from './cartoesFlotaExport';
import { CartoesFlotaKpis } from './CartoesFlotaKpis';
import { CartoesFlotaFiltros } from './CartoesFlotaFiltros';
import { CartoesFlotaTabela } from './CartoesFlotaTabela';
import { CartaoFormDialog } from './CartaoFormDialog';
import { CartaoDeleteAlert } from './CartaoDeleteAlert';
import { CartoesImportDialog } from './CartoesImportDialog';
import { CartaoHistoricoSheet } from './CartaoHistoricoSheet';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

export function CartoesFlotaTab() {
  const { toast } = useToast();
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.ADMINISTRATIVO_CARTOES);
  const { data: cartoes = [], isLoading: loading } = useCartoesFrotaLista<CartaoFrota>();
  const { data: motoristas = [] } = useMotoristasParaCartoes() as { data?: MotoristaOption[] };
  const guardarCartao = useGuardarCartaoFrota();
  const eliminarCartao = useEliminarCartaoFrota();
  const importarCartoes = useImportarCartoesFrota();
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'todos' | 'bp' | 'repsol' | 'edp'>('todos');
  const [sortField, setSortField] = useState<string>('numero');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // 'ativos' (esconde cancelados) · 'todos' · ou um estado específico
  const [statusSel, setStatusSel] = useState<string>('ativos');
  const [consumoMap, setConsumoMap] = useState<Record<string, { total: number; litros: number }>>(
    {}
  );

  // CRUD Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CartaoFrota | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showPin, setShowPin] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<CartaoFrota | null>(null);

  // History Sheet
  const [historyCartao, setHistoryCartao] = useState<CartaoFrota | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    carregarConsumo();
  }, []);

  // A lista de cartões e o dropdown de motoristas vivem em
  // @/hooks/useCartoesFrota. `CartaoFrota` é escrito à mão e diverge da forma
  // que a BD devolve com as relações embebidas — daí o parâmetro de tipo em
  // useCartoesFrotaLista<CartaoFrota>(), que mantém a asserção num sítio só.

  const carregarConsumo = async () => {
    try {
      const now = new Date();
      const desde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const ate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const { data, error } = await supabase.rpc('get_cartoes_consumo', {
        p_desde: desde,
        p_ate: ate,
      });
      if (error) throw error;
      const map: Record<string, { total: number; litros: number }> = {};
      (data || []).forEach((r: any) => {
        if (r.numero == null) return;
        map[`${r.tipo}|${r.numero}`] = {
          total: Number(r.total) || 0,
          litros: Number(r.litros) || 0,
        };
      });
      setConsumoMap(map);
    } catch {
      /* consumo é opcional — a barra fica sem dados */
    }
  };

  const motoristaNome = (id: string | null) =>
    id ? (motoristas.find((m) => m.id === id)?.nome ?? '') : '';

  const consumoOf = (c: CartaoFrota) => consumoMap[`${c.tipo}|${c.numero}`]?.total ?? 0;

  const filtered = useMemo(() => {
    const list = cartoes.filter((c) => {
      if (tipoFilter !== 'todos' && c.tipo !== tipoFilter) return false;
      if (statusSel === 'ativos') {
        if (c.status === 'cancelado') return false;
      } else if (statusSel !== 'todos' && c.status !== statusSel) {
        return false;
      }
      if (!search) return true;
      const t = norm(search);
      return (
        norm(c.numero).includes(t) ||
        norm(c.motorista?.nome || '').includes(t) ||
        norm(c.cliente?.nome || '').includes(t) ||
        norm(c.detentor || '').includes(t) ||
        norm(c.ambito || '').includes(t)
      );
    });
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'tipo') {
        va = a.tipo;
        vb = b.tipo;
      } else if (sortField === 'numero') {
        va = a.numero;
        vb = b.numero;
      } else if (sortField === 'detentor') {
        va = a.detentor || '';
        vb = b.detentor || '';
      } else if (sortField === 'titular') {
        va = a.motorista?.nome || a.cliente?.nome || '';
        vb = b.motorista?.nome || b.cliente?.nome || '';
      } else if (sortField === 'limite') {
        va = a.limite ?? -Infinity;
        vb = b.limite ?? -Infinity;
      } else if (sortField === 'validade') {
        va = a.data_validade || '';
        vb = b.data_validade || '';
      } else if (sortField === 'status') {
        va = STATUS_ORDER.indexOf(a.status);
        vb = STATUS_ORDER.indexOf(b.status);
      } else if (sortField === 'consumo') {
        va = consumoOf(a);
        vb = consumoOf(b);
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartoes, search, tipoFilter, statusSel, sortField, sortDir, consumoMap]);

  // KPIs sobre a VISTA FILTRADA (respondem a tipo/estado/pesquisa).
  const kpis = useMemo(() => {
    const emUso = filtered.filter((c) => c.status === 'em_uso').length;
    const disp = filtered.filter((c) => c.status === 'disponivel').length;
    const canc = filtered.filter((c) => c.status === 'cancelado').length;
    const plafondAtivo = filtered
      .filter((c) => c.status === 'em_uso')
      .reduce((s, c) => s + (c.limite || 0), 0);
    const consumoMes = filtered.reduce(
      (s, c) => s + (consumoMap[`${c.tipo}|${c.numero}`]?.total ?? 0),
      0
    );
    return { total: filtered.length, emUso, disp, canc, plafondAtivo, consumoMes };
  }, [filtered, consumoMap]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    cartoes.forEach((c) => (m[c.status] = (m[c.status] || 0) + 1));
    return m;
  }, [cartoes]);

  const { setPage, totalPages, total, pageItems, start, end, page, pageSizeStr, setPageSizeStr } =
    usePagination(filtered, 25, `${search}|${tipoFilter}|${sortField}|${sortDir}`);

  // ── CRUD ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowPin(false);
    setDialogOpen(true);
  };

  const openEdit = (c: CartaoFrota, movimento: Movimento = 'nenhum') => {
    setEditing(c);
    setForm({
      numero: c.numero,
      tipo: c.tipo,
      data_validade: c.data_validade || '',
      limite: c.limite != null ? String(c.limite) : '',
      pin: c.pin || '',
      ambito: c.ambito || '',
      detentor: c.detentor || '',
      notas: c.notas || '',
      devolucao: c.devolucao || '',
      status: c.status || 'disponivel',
      motorista_id: c.motorista_id || '',
      ultimo_motorista_id: c.ultimo_motorista_id || '',
      data_entrega: movimento === 'entrega' && !c.data_entrega ? todayISO() : c.data_entrega || '',
      data_devolucao:
        movimento === 'devolucao' && !c.data_devolucao ? todayISO() : c.data_devolucao || '',
      movimento,
    });
    setShowPin(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.numero.trim()) {
      toast({ title: 'Número obrigatório', variant: 'destructive' });
      return;
    }

    // ── Lógica de movimento (Entrega / Devolução) ──
    let motoristaId: string | null = form.motorista_id || null;
    let ultimoId: string | null = form.ultimo_motorista_id || null;
    let status: StatusCartao = form.status;
    let dataEntrega: string | null = form.data_entrega || null;
    let dataDevolucao: string | null = form.data_devolucao || null;
    const devolucaoNota: string | null = form.devolucao || null;
    const oldMot = editing?.motorista_id || null;

    if (form.movimento === 'entrega') {
      if (!motoristaId) {
        toast({ title: 'Selecione o motorista para a entrega', variant: 'destructive' });
        return;
      }
      if (oldMot && oldMot !== motoristaId) ultimoId = oldMot;
      status = 'em_uso';
      dataEntrega = form.data_entrega || todayISO();
    } else if (form.movimento === 'devolucao') {
      const holder = motoristaId || oldMot;
      if (holder) ultimoId = holder;
      motoristaId = null;
      status = 'disponivel';
      dataDevolucao = form.data_devolucao || todayISO();
    } else if (oldMot && oldMot !== motoristaId) {
      // Sem movimento explícito, mas o motorista foi trocado à mão → último automático.
      ultimoId = oldMot;
    }

    setSaving(true);
    try {
      const payload = {
        numero: form.numero.trim(),
        tipo: form.tipo,
        data_validade: form.data_validade || null,
        limite: form.limite ? Number(form.limite) : null,
        pin: form.pin || null,
        ambito: form.ambito || null,
        detentor: form.detentor || null,
        notas: form.notas || null,
        devolucao: devolucaoNota,
        status,
        motorista_id: motoristaId,
        ultimo_motorista_id: ultimoId,
        data_entrega: dataEntrega,
        data_devolucao: dataDevolucao,
        // `ativo` mantido em sincronia com o ciclo de vida (usado no export/impressão).
        ativo: status === 'disponivel' || status === 'em_uso',
      };
      await guardarCartao.mutateAsync({ cartaoId: editing?.id, payload });
      toast({ title: editing ? 'Cartão atualizado' : 'Cartão criado' });
      setDialogOpen(false);
    } catch (err: unknown) {
      toast({ title: 'Erro', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !podeGerir) return;
    try {
      await eliminarCartao.mutateAsync(deleteTarget.id);
      toast({ title: 'Cartão eliminado' });
    } catch (err: unknown) {
      toast({ title: 'Erro', description: errorMessage(err), variant: 'destructive' });
    }
    setDeleteTarget(null);
  };

  // ── HISTORY ───────────────────────────────────────────────────────────
  const openHistory = async (c: CartaoFrota) => {
    setHistoryCartao(c);
    setHistorico([]);
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase.rpc('get_cartao_historico_consumo', {
        p_tipo: c.tipo,
        p_numero: c.numero,
      });
      if (error) throw error;
      setHistorico(data || []);
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar histórico',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingHistory(false);
    }
  };

  const totalHistorico = useMemo(
    () => historico.reduce((s, r) => s + (r.amount || 0), 0),
    [historico]
  );

  // ── IMPORT ────────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = readWorkbook(ev.target?.result as ArrayBuffer);
        const rows = parseSheet(wb);
        if (rows.length === 0) {
          toast({ title: 'Ficheiro vazio ou sem dados reconhecidos', variant: 'destructive' });
          return;
        }
        setImportRows(rows);
        setImportOpen(true);
      } catch {
        toast({
          title: 'Erro ao ler ficheiro',
          description: 'Certifique-se que é um ficheiro .xlsx ou .xls válido.',
          variant: 'destructive',
        });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    if (!podeGerir) return;
    const valid = importRows.filter((r) => r.erros.length === 0);
    if (valid.length === 0) return;
    setImporting(true);
    try {
      const { data: orgId } = await supabase.rpc('get_current_org_id');
      const payload = valid.map((r) => ({
        org_id: orgId,
        numero: r.numero,
        tipo: r.tipo as TipoCartao,
        ambito: r.ambito || null,
        limite: r.limite ? Number(r.limite) : null,
        pin: r.pin || null,
        data_validade: r.data_validade || null,
        detentor: r.detentor || null,
        notas: r.notas || null,
        devolucao: r.devolucao || null,
      }));
      await importarCartoes.mutateAsync(payload);
      toast({ title: `${valid.length} cartão(ões) importado(s)/atualizado(s) com sucesso` });
      setImportOpen(false);
    } catch (err: unknown) {
      toast({
        title: 'Erro na importação',
        description: errorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const titularLabel = (c: CartaoFrota) => {
    if (c.motorista) return { texto: c.motorista.nome, tipo: 'motorista' as const };
    if (c.cliente) return { texto: c.cliente.nome, tipo: 'cliente' as const };
    return null;
  };

  const handleExport = () => exportarCartoesExcel({ filtered, consumoOf });

  const handlePrint = () =>
    exportarCartoesPrint({
      filtered,
      kpis,
      tipoFilter,
      statusSel,
      search,
      consumoOf,
      titularLabel,
    });

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 mt-4">
      <CartoesFlotaKpis kpis={kpis} />

      <CartoesFlotaFiltros
        search={search}
        onSearchChange={setSearch}
        tipoFilter={tipoFilter}
        onTipoFilterChange={setTipoFilter}
        statusSel={statusSel}
        onStatusSelChange={setStatusSel}
        statusCounts={statusCounts}
        onPrint={handlePrint}
        onImportClick={() => fileInputRef.current?.click()}
        onExport={handleExport}
        onCreate={openCreate}
        fileInputRef={fileInputRef}
        onFileChange={handleFileChange}
      />
      <span className="text-sm text-muted-foreground">{filtered.length} cartão(ões)</span>

      <CartoesFlotaTabela
        loading={loading}
        cartoesLength={cartoes.length}
        filtered={filtered}
        pageItems={pageItems}
        sortField={sortField}
        sortDir={sortDir}
        onSort={(f) => {
          if (sortField === f) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
          else {
            setSortField(f);
            setSortDir('asc');
          }
        }}
        consumoOf={consumoOf}
        titularLabel={titularLabel}
        onEdit={(c) => openEdit(c)}
        onEntrega={(c) => openEdit(c, 'entrega')}
        onDevolucao={(c) => openEdit(c, 'devolucao')}
        onHistory={openHistory}
        onDeleteRequest={setDeleteTarget}
        pagination={{ page, totalPages, total, start, end, pageSizeStr, setPage, setPageSizeStr }}
      />

      <CartaoFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        form={form}
        setForm={setForm}
        showPin={showPin}
        setShowPin={setShowPin}
        motoristas={motoristas}
        motoristaNome={motoristaNome}
        saving={saving}
        onSave={handleSave}
      />

      <CartaoDeleteAlert
        deleteTarget={deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <CartoesImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        importRows={importRows}
        importing={importing}
        onConfirm={handleImportConfirm}
      />

      <CartaoHistoricoSheet
        historyCartao={historyCartao}
        onOpenChange={(o) => !o && setHistoryCartao(null)}
        loadingHistory={loadingHistory}
        historico={historico}
        totalHistorico={totalHistorico}
      />
    </div>
  );
}
