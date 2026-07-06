import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Pencil,
  Trash2,
  History,
  Loader2,
  Search,
  Fuel,
  Zap,
  UserCheck,
  UserX,
  Eye,
  EyeOff,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Printer,
  FileDown,
  ChevronDown,
} from 'lucide-react';

type StatusCartao = 'disponivel' | 'em_uso' | 'cancelado' | 'bloqueado' | 'perdido';

interface CartaoFrota {
  id: string;
  numero: string;
  tipo: 'bp' | 'repsol' | 'edp';
  motorista_id: string | null;
  ultimo_motorista_id: string | null;
  cliente_id: string | null;
  ativo: boolean;
  status: StatusCartao;
  data_validade: string | null;
  data_entrega: string | null;
  data_devolucao: string | null;
  limite: number | null;
  pin: string | null;
  ambito: string | null;
  detentor: string | null;
  notas: string | null;
  devolucao: string | null;
  motorista: { nome: string } | null;
  ultimo_motorista: { nome: string } | null;
  cliente: { nome: string } | null;
}

interface MotoristaOption {
  id: string;
  nome: string;
}

const STATUS_INFO: Record<StatusCartao, { label: string; cls: string }> = {
  disponivel: {
    label: 'Disponível',
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  em_uso: {
    label: 'Em Uso',
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  },
  cancelado: {
    label: 'Cancelado',
    cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  },
  bloqueado: {
    label: 'Bloqueado',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  },
  perdido: {
    label: 'Perdido',
    cls: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300',
  },
};

const STATUS_ORDER: StatusCartao[] = ['disponivel', 'em_uso', 'cancelado', 'bloqueado', 'perdido'];

interface HistoricoItem {
  transaction_date: string;
  amount: number;
  station_name: string | null;
  fuel_type: string | null;
  quantity: number | null;
}

// ── Import types ────────────────────────────────────────────────────────────
type TipoCartao = 'bp' | 'repsol' | 'edp';

interface ImportRow {
  _row: number;
  tipo: TipoCartao | '';
  numero: string;
  ambito: string;
  limite: string;
  pin: string;
  data_validade: string;
  detentor: string;
  notas: string;
  devolucao: string;
  erros: string[];
}

const VALID_TIPOS: TipoCartao[] = ['bp', 'repsol', 'edp'];

function parseTipo(raw: unknown): TipoCartao | '' {
  const s = String(raw || '')
    .toLowerCase()
    .trim();
  if (VALID_TIPOS.includes(s as TipoCartao)) return s as TipoCartao;
  return '';
}

function parseExcelDate(raw: unknown): string {
  if (!raw) return '';
  // Excel serial number
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function colKey(header: string) {
  return header.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, '_');
}

const COL_MAP: Record<string, keyof Omit<ImportRow, '_row' | 'erros'>> = {
  tipo: 'tipo',
  type: 'tipo',
  numero: 'numero',
  number: 'numero',
  num: 'numero',
  card: 'numero',
  cartao: 'numero',
  cartão: 'numero',
  ambito: 'ambito',
  âmbito: 'ambito',
  ambience: 'ambito',
  scope: 'ambito',
  limite: 'limite',
  limit: 'limite',
  budget: 'limite',
  orcamento: 'limite',
  orçamento: 'limite',
  pin: 'pin',
  validade: 'data_validade',
  data_validade: 'data_validade',
  expiry: 'data_validade',
  expiracao: 'data_validade',
  expiração: 'data_validade',
  validity: 'data_validade',
  notas: 'notas',
  notes: 'notas',
  observacoes: 'notas',
  observações: 'notas',
  detentor: 'detentor',
  'detentor do cartao': 'detentor',
  'detentor do cartão': 'detentor',
  titular: 'detentor',
  holder: 'detentor',
  devolucao: 'devolucao',
  devolução: 'devolucao',
  return: 'devolucao',
  devolvido: 'devolucao',
};

function parseSheet(wb: XLSX.WorkBook): ImportRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  if (raw.length < 2) return [];

  const headers = (raw[0] as unknown[]).map((h) => colKey(String(h)));
  const fieldMap: Record<number, keyof Omit<ImportRow, '_row' | 'erros'>> = {};
  headers.forEach((h, i) => {
    if (COL_MAP[h]) fieldMap[i] = COL_MAP[h];
  });

  return raw
    .slice(1)
    .map((row, idx) => {
      const r: ImportRow = {
        _row: idx + 2,
        tipo: '',
        numero: '',
        ambito: '',
        limite: '',
        pin: '',
        data_validade: '',
        detentor: '',
        notas: '',
        devolucao: '',
        erros: [],
      };
      (row as unknown[]).forEach((cell, i) => {
        const field = fieldMap[i];
        if (!field) return;
        if (field === 'tipo') {
          r.tipo = parseTipo(cell);
        } else if (field === 'data_validade') {
          r.data_validade = parseExcelDate(cell);
        } else {
          (r as any)[field] = String(cell || '').trim();
        }
      });
      // Validate
      if (!r.numero) r.erros.push('Número em falta');
      if (!r.tipo) r.erros.push(`Tipo inválido (use bp/repsol/edp)`);
      if (r.limite && isNaN(Number(r.limite))) r.erros.push('Limite inválido');
      return r;
    })
    .filter((r) => r.numero || r.tipo); // skip empty rows
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    [
      'Tipo',
      'Numero',
      'Ambito',
      'Limite',
      'PIN',
      'Validade',
      'Detentor do Cartão',
      'Notas',
      'Devolução',
    ],
    ['bp', '1234567890', 'Nacional', '200', '1234', '31/12/2026', 'DISTÂNCIA 01', '', ''],
    ['repsol', '9876543210', 'Nacional', '', '', '', 'DISTÂNCIA 02', '', ''],
    [
      'edp',
      '5551234567',
      'Nacional',
      '150',
      '',
      '30/06/2027',
      'DISTÂNCIA 03',
      'Carreg. rápido',
      '',
    ],
  ]);
  ws['!cols'] = [8, 14, 12, 8, 6, 12, 20, 20, 20].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cartões');
  XLSX.writeFile(wb, 'template_cartoes_frota.xlsx');
}

const TIPO_INFO = {
  bp: {
    label: 'BP',
    Icon: Fuel,
    badgeCls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  repsol: {
    label: 'Repsol',
    Icon: Fuel,
    badgeCls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  },
  edp: {
    label: 'EDP',
    Icon: Zap,
    badgeCls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
} as const;

const fmtEur = (v: number | null) =>
  v == null
    ? '-'
    : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
const fmtDate = (s: string | null) => {
  if (!s) return '-';
  try {
    return format(new Date(s), 'dd/MM/yyyy', { locale: pt });
  } catch {
    return s.slice(0, 10);
  }
};
const fmtDT = (s: string | null) => {
  if (!s) return '-';
  try {
    return format(new Date(s), 'dd/MM/yyyy HH:mm', { locale: pt });
  } catch {
    return s.slice(0, 16);
  }
};
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

type Movimento = 'nenhum' | 'entrega' | 'devolucao';

type FormState = {
  numero: string;
  tipo: 'bp' | 'repsol' | 'edp';
  data_validade: string;
  limite: string;
  pin: string;
  ambito: string;
  detentor: string;
  notas: string;
  devolucao: string;
  status: StatusCartao;
  motorista_id: string;
  ultimo_motorista_id: string;
  data_entrega: string;
  data_devolucao: string;
  movimento: Movimento;
};

const emptyForm = (): FormState => ({
  numero: '',
  tipo: 'bp',
  data_validade: '',
  limite: '',
  pin: '',
  ambito: '',
  detentor: '',
  notas: '',
  devolucao: '',
  status: 'disponivel',
  motorista_id: '',
  ultimo_motorista_id: '',
  data_entrega: '',
  data_devolucao: '',
  movimento: 'nenhum',
});

const todayISO = () => new Date().toISOString().slice(0, 10);

const KpiTile = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
}) => (
  <div className="rounded-lg border bg-card/50 px-3 py-2">
    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
      {label}
    </p>
    <p className={`text-lg font-bold ${accent || ''}`}>{value}</p>
  </div>
);

export function CartoesFlotaTab() {
  const { toast } = useToast();
  const [cartoes, setCartoes] = useState<CartaoFrota[]>([]);
  const [motoristas, setMotoristas] = useState<MotoristaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'todos' | 'bp' | 'repsol' | 'edp'>('todos');
  const [sortField, setSortField] = useState<string>('numero');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // 'ativos' (esconde cancelados) · 'todos' · ou um estado específico
  const [statusSel, setStatusSel] = useState<string>('ativos');
  const [page, setPage] = useState(1);
  const [consumoMap, setConsumoMap] = useState<Record<string, { total: number; litros: number }>>(
    {}
  );
  const PAGE_SIZE = 25;

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
    carregar();
    carregarMotoristas();
    carregarConsumo();
  }, []);

  const carregar = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('cartoes_frota')
        .select(
          '*, motorista:motorista_id(nome), ultimo_motorista:ultimo_motorista_id(nome), cliente:cliente_id(nome)'
        )
        .order('tipo')
        .order('numero');
      if (error) throw error;
      setCartoes(data || []);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const carregarMotoristas = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('motoristas_ativos')
        .select('id, nome')
        .order('nome');
      if (error) throw error;
      setMotoristas(data || []);
    } catch {
      /* silencioso — o dropdown fica vazio mas o resto funciona */
    }
  };

  const carregarConsumo = async () => {
    try {
      const now = new Date();
      const desde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const ate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const { data, error } = await (supabase as any).rpc('get_cartoes_consumo', {
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page, PAGE_SIZE]
  );

  useEffect(() => {
    setPage(1);
  }, [search, tipoFilter, statusSel, sortField, sortDir]);

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
      const { error } = editing
        ? await (supabase as any).from('cartoes_frota').update(payload).eq('id', editing.id)
        : await (supabase as any).from('cartoes_frota').insert(payload);
      if (error) throw error;
      toast({ title: editing ? 'Cartão atualizado' : 'Cartão criado' });
      setDialogOpen(false);
      carregar();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await (supabase as any)
      .from('cartoes_frota')
      .delete()
      .eq('id', deleteTarget.id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Cartão eliminado' });
      carregar();
    }
    setDeleteTarget(null);
  };

  // ── HISTORY ───────────────────────────────────────────────────────────
  const openHistory = async (c: CartaoFrota) => {
    setHistoryCartao(c);
    setHistorico([]);
    setLoadingHistory(true);
    try {
      const { data, error } = await (supabase as any).rpc('get_cartao_historico_consumo', {
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
        const wb = XLSX.read(ev.target?.result, { type: 'array', cellDates: false });
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
    const valid = importRows.filter((r) => r.erros.length === 0);
    if (valid.length === 0) return;
    setImporting(true);
    try {
      const { data: orgId } = await (supabase as any).rpc('get_current_org_id');
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
      const { error } = await (supabase as any)
        .from('cartoes_frota')
        .upsert(payload, { onConflict: 'org_id,tipo,numero', ignoreDuplicates: false });
      if (error) throw error;
      toast({ title: `${valid.length} cartão(ões) importado(s)/atualizado(s) com sucesso` });
      setImportOpen(false);
      carregar();
    } catch (err: any) {
      toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const handleExport = () => {
    const rows = filtered.map((c) => ({
      Tipo: TIPO_INFO[c.tipo].label,
      Número: c.numero,
      'Detentor do Cartão': c.detentor || '',
      Âmbito: c.ambito || '',
      Titular: c.motorista?.nome || c.cliente?.nome || '',
      'Tipo Titular': c.motorista ? 'Motorista' : c.cliente ? 'Cliente' : '',
      'Plafond (€)': c.limite ?? '',
      'Consumo mês (€)': consumoOf(c) || '',
      Validade: c.data_validade ? fmtDate(c.data_validade) : '',
      Status: STATUS_INFO[c.status]?.label ?? c.status,
      Observações: c.notas || '',
      Devolução: c.devolucao || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cartões Frota');
    XLSX.writeFile(wb, `cartoes_frota_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handlePrint = async () => {
    let logoUrl = '';
    try {
      const res = await fetch('/Logo.png');
      const blob = await res.blob();
      logoUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      logoUrl = '/Logo.png';
    }
    const date = fmtDT(new Date().toISOString());
    // Impressão = vista atual (filtros aplicados) → bate certo com os KPIs.
    const dados = [...filtered].sort(
      (a, b) => a.tipo.localeCompare(b.tipo) || (Number(a.numero) || 0) - (Number(b.numero) || 0)
    );
    const filtroDesc =
      [
        tipoFilter !== 'todos' ? `Tipo: ${TIPO_INFO[tipoFilter].label}` : null,
        statusSel === 'ativos'
          ? 'Estado: ativos (sem cancelados)'
          : statusSel === 'todos'
            ? null
            : `Estado: ${STATUS_INFO[statusSel as StatusCartao]?.label ?? statusSel}`,
        search ? `Pesquisa: "${search}"` : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'Todos os cartões';
    const rows = dados
      .map((c) => {
        const t = titularLabel(c);
        const badgeCls =
          c.tipo === 'bp' ? 'badge-bp' : c.tipo === 'repsol' ? 'badge-repsol' : 'badge-edp';
        const cons = consumoOf(c);
        return `<tr>
        <td><span class="badge ${badgeCls}">${TIPO_INFO[c.tipo].label}</span></td>
        <td class="mono">${c.numero}</td>
        <td>${c.detentor || '<span class="muted">-</span>'}</td>
        <td>${t ? t.texto : '<span class="muted">—</span>'}</td>
        <td style="text-align:right">${c.limite != null ? fmtEur(c.limite) : '<span class="muted">-</span>'}</td>
        <td style="text-align:right">${cons > 0 ? fmtEur(cons) : '<span class="muted">—</span>'}</td>
        <td>${fmtDate(c.data_validade)}</td>
        <td><span class="badge badge-${c.status}">${STATUS_INFO[c.status]?.label ?? c.status}</span></td>
      </tr>`;
      })
      .join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document
      .write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cartões Frota — WeGest</title><link rel="icon" href="${logoUrl}" type="image/png">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a1a;background:white}
      .page{padding:24px 32px}
      .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:2px solid #e5e7eb;margin-bottom:20px}
      .header-left{display:flex;align-items:center;gap:16px}
      .header-logo{height:48px;width:auto}
      .header-title h1{font-size:18px;font-weight:700;color:#111827}
      .header-title p{font-size:11px;color:#6b7280;margin-top:2px}
      .header-right{text-align:right;font-size:10px;color:#6b7280;line-height:1.8}
      .stats{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px}
      .stat{border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;min-width:80px}
      .stat .lbl{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
      .stat .val{font-size:19px;font-weight:700;color:#111827}
      table{width:100%;border-collapse:collapse}
      thead th{background:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:2px solid #d1d5db;padding:8px 10px;text-align:left;font-weight:600;color:#374151;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em}
      tbody td{border-bottom:1px solid #f3f4f6;padding:7px 10px}
      tbody tr:nth-child(even) td{background:#f9fafb}
      .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:9px;font-weight:600}
      .badge-bp{background:#d1fae5;color:#065f46}
      .badge-repsol{background:#ffedd5;color:#9a3412}
      .badge-edp{background:#ede9fe;color:#5b21b6}
      .badge-disponivel{background:#f1f5f9;color:#334155}
      .badge-em_uso{background:#dbeafe;color:#1e40af}
      .badge-cancelado{background:#fee2e2;color:#991b1b}
      .badge-bloqueado{background:#fef3c7;color:#92400e}
      .badge-perdido{background:#e4e4e7;color:#3f3f46}
      .mono{font-family:'Courier New',monospace}
      .muted{color:#9ca3af}
      .footer{margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#9ca3af}
      @media print{body{margin:0}.page{padding:16px 20px}@page{margin:10mm}}
    </style></head><body onload="window.print()">
    <div class="page">
      <div class="header">
        <div class="header-left">
          <img src="${logoUrl}" alt="WeGest" class="header-logo" />
          <div class="header-title">
            <h1>Cartões Frota</h1>
            <p>${filtroDesc}</p>
          </div>
        </div>
        <div class="header-right"><div>Exportado em ${date}</div><div>${filtered.length} cartão(ões) — vista atual</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="lbl">Total</div><div class="val">${kpis.total}</div></div>
        <div class="stat"><div class="lbl">Em Uso</div><div class="val">${kpis.emUso}</div></div>
        <div class="stat"><div class="lbl">Disponíveis</div><div class="val">${kpis.disp}</div></div>
        <div class="stat"><div class="lbl">Cancelados</div><div class="val">${kpis.canc}</div></div>
        <div class="stat"><div class="lbl">Plafond ativo</div><div class="val">${fmtEur(kpis.plafondAtivo)}</div></div>
        <div class="stat"><div class="lbl">Consumo do mês</div><div class="val">${fmtEur(kpis.consumoMes)}</div></div>
      </div>
      <table>
        <thead><tr><th>Tipo</th><th>Número</th><th>Detentor</th><th>Titular</th><th style="text-align:right">Plafond</th><th style="text-align:right">Consumo (mês)</th><th>Validade</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer"><span>WeGest — Sistema de Gestão de Frotas</span><span>Gerado automaticamente em ${date}</span></div>
    </div>
    </body></html>`);
    w.document.close();
  };

  const titularLabel = (c: CartaoFrota) => {
    if (c.motorista) return { texto: c.motorista.nome, tipo: 'motorista' as const };
    if (c.cliente) return { texto: c.cliente.nome, tipo: 'cliente' as const };
    return null;
  };

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 mt-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile label="Total" value={kpis.total} />
        <KpiTile label="Em Uso" value={kpis.emUso} accent="text-blue-600 dark:text-blue-400" />
        <KpiTile
          label="Disponíveis"
          value={kpis.disp}
          accent="text-slate-600 dark:text-slate-300"
        />
        <KpiTile label="Cancelados" value={kpis.canc} accent="text-red-600 dark:text-red-400" />
        <KpiTile label="Plafond ativo" value={fmtEur(kpis.plafondAtivo)} />
        <KpiTile label="Consumo do mês" value={fmtEur(kpis.consumoMes)} accent="text-orange-500" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar número, detentor, titular…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as typeof tipoFilter)}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="bp">BP</SelectItem>
              <SelectItem value="repsol">Repsol</SelectItem>
              <SelectItem value="edp">EDP</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusSel} onValueChange={setStatusSel}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativos">Ativos (sem cancelados)</SelectItem>
              <SelectItem value="todos">Todos os estados</SelectItem>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_INFO[s].label} ({statusCounts[s] || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <FileDown className="h-4 w-4 mr-2" />
                Dados
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Importar Excel
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExport}>
                <FileDown className="h-4 w-4 mr-2" />
                Exportar Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Cartão
          </Button>
        </div>
      </div>
      <span className="text-sm text-muted-foreground">{filtered.length} cartão(ões)</span>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          {cartoes.length === 0
            ? 'Nenhum cartão criado ainda. Clique em "Adicionar Cartão".'
            : 'Nenhum cartão encontrado.'}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              {(() => {
                const handleSort = (f: string) => {
                  if (sortField === f) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                  else {
                    setSortField(f);
                    setSortDir('asc');
                  }
                };
                const SortTh = ({
                  field,
                  children,
                  className,
                }: {
                  field: string;
                  children: React.ReactNode;
                  className?: string;
                }) => {
                  const active = sortField === field;
                  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <TableHead className={className}>
                      <button
                        onClick={() => handleSort(field)}
                        className={`flex items-center gap-1 text-xs font-medium hover:text-foreground transition-colors ${active ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        {children}
                        <Icon className="h-3 w-3 shrink-0" />
                      </button>
                    </TableHead>
                  );
                };
                return (
                  <TableRow>
                    <SortTh field="tipo">Tipo</SortTh>
                    <SortTh field="numero">Número</SortTh>
                    <SortTh field="detentor">Detentor</SortTh>
                    <SortTh field="titular">Titular</SortTh>
                    <SortTh field="limite" className="text-right">
                      Plafond
                    </SortTh>
                    <SortTh field="consumo" className="text-right">
                      Consumo (mês)
                    </SortTh>
                    <SortTh field="validade">Validade</SortTh>
                    <SortTh field="status">Status</SortTh>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                );
              })()}
            </TableHeader>
            <TableBody>
              {paged.map((c) => {
                const info = TIPO_INFO[c.tipo];
                const Icon = info.Icon;
                const titular = titularLabel(c);
                return (
                  <TableRow
                    key={c.id}
                    onClick={() => openEdit(c)}
                    className={`cursor-pointer hover:bg-muted/50 ${c.status === 'cancelado' ? 'opacity-55' : ''}`}
                  >
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${info.badgeCls}`}
                      >
                        <Icon className="h-3 w-3" />
                        {info.label}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono font-medium text-sm">{c.numero}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.detentor || '-'}
                    </TableCell>
                    <TableCell>
                      {titular ? (
                        <span className="flex items-center gap-1.5 text-sm">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate max-w-[160px]">{titular.texto}</span>
                          {titular.tipo === 'cliente' && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">
                              cliente
                            </Badge>
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <UserX className="h-3.5 w-3.5 shrink-0" />
                          Disponível
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {c.limite != null ? fmtEur(c.limite) : '-'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {(() => {
                        const cons = consumoOf(c);
                        const lim = c.limite || 0;
                        const pct = lim > 0 ? Math.min(100, (cons / lim) * 100) : 0;
                        const barColor =
                          pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
                        return (
                          <div className="flex flex-col items-end gap-1 min-w-[80px]">
                            <span className={cons > 0 ? 'font-medium' : 'text-muted-foreground'}>
                              {cons > 0 ? fmtEur(cons) : '—'}
                            </span>
                            {lim > 0 && cons > 0 && (
                              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full ${barColor}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        if (!c.data_validade)
                          return <span className="text-muted-foreground">-</span>;
                        const d = new Date(c.data_validade);
                        const now = new Date();
                        const months =
                          (d.getFullYear() - now.getFullYear()) * 12 +
                          (d.getMonth() - now.getMonth());
                        const expired = d < now;
                        const soon = !expired && months <= 3;
                        return (
                          <span
                            className={`inline-flex items-center gap-1 ${
                              expired
                                ? 'text-red-600 dark:text-red-400 font-medium'
                                : soon
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {(expired || soon) && <AlertTriangle className="h-3 w-3 shrink-0" />}
                            {fmtDate(c.data_validade)}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_INFO[c.status]?.cls ?? STATUS_INFO.disponivel.cls}`}
                      >
                        {STATUS_INFO[c.status]?.label ?? c.status}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {c.status !== 'cancelado' &&
                          (c.status === 'em_uso' ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-600 hover:text-amber-600"
                              onClick={() => openEdit(c, 'devolucao')}
                              title="Devolver cartão"
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-600 hover:text-blue-600"
                              onClick={() => openEdit(c, 'entrega')}
                              title="Entregar a motorista"
                            >
                              <UserCheck className="h-4 w-4" />
                            </Button>
                          ))}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openHistory(c)}
                          title="Histórico de consumo"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Paginação */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPages} · {filtered.length} cartão(ões)
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Seguinte
            </Button>
          </div>
        </div>
      )}

      {/* ── CRUD Dialog (full-screen) ───────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl w-[96vw] h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b bg-muted/30 shrink-0">
            <DialogTitle className="flex flex-wrap items-center gap-3 text-lg">
              {editing ? 'Editar Cartão Frota' : 'Novo Cartão Frota'}
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_INFO[form.tipo].badgeCls}`}
              >
                {TIPO_INFO[form.tipo].label}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_INFO[form.status].cls}`}
              >
                {STATUS_INFO[form.status].label}
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Body (scroll) */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
            {/* ── Dados do Cartão ── */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Fuel className="h-4 w-4 text-muted-foreground" /> Dados do Cartão
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Tipo *</Label>
                  <Select
                    value={form.tipo}
                    onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as typeof f.tipo }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bp">BP</SelectItem>
                      <SelectItem value="repsol">Repsol</SelectItem>
                      <SelectItem value="edp">EDP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Cartão (Nº) *</Label>
                  <Input
                    placeholder="Ex: 1234567890"
                    value={form.numero}
                    onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Detentor do Cartão</Label>
                  <Input
                    placeholder="Ex: DISTÂNCIA 01"
                    value={form.detentor}
                    onChange={(e) => setForm((f) => ({ ...f, detentor: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Plafond (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={form.limite}
                    onChange={(e) => setForm((f) => ({ ...f, limite: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Validade</Label>
                  <Input
                    type="date"
                    value={form.data_validade}
                    onChange={(e) => setForm((f) => ({ ...f, data_validade: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Âmbito do Cartão</Label>
                  <Input
                    placeholder="Ex: Combustível, Elétrico…"
                    value={form.ambito}
                    onChange={(e) => setForm((f) => ({ ...f, ambito: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>PIN do Cartão</Label>
                  <div className="relative">
                    <Input
                      type={showPin ? 'text' : 'password'}
                      placeholder="PIN"
                      value={form.pin}
                      onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                      onClick={() => setShowPin((s) => !s)}
                    >
                      {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Atribuição & Movimento ── */}
            <section className="space-y-4 border-t pt-6">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" /> Atribuição & Movimento
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v as StatusCartao }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_ORDER.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_INFO[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Movimento</Label>
                  <Select
                    value={form.movimento}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        movimento: v as Movimento,
                        data_entrega:
                          v === 'entrega' && !f.data_entrega ? todayISO() : f.data_entrega,
                        data_devolucao:
                          v === 'devolucao' && !f.data_devolucao ? todayISO() : f.data_devolucao,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Sem alteração</SelectItem>
                      <SelectItem value="entrega">Entrega (atribuir a motorista)</SelectItem>
                      <SelectItem value="devolucao">Devolução (libertar cartão)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Último motorista</Label>
                  <Input
                    readOnly
                    value={
                      motoristaNome(form.ultimo_motorista_id) ||
                      editing?.ultimo_motorista?.nome ||
                      '—'
                    }
                    className="bg-muted/50 text-muted-foreground"
                  />
                </div>
              </div>

              {/* Campos condicionais por movimento */}
              {form.movimento === 'entrega' && (
                <div className="grid gap-4 sm:grid-cols-2 rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-900/10">
                  <div className="space-y-1.5">
                    <Label>Motorista *</Label>
                    <Select
                      value={form.motorista_id || '__none__'}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, motorista_id: v === '__none__' ? '' : v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar motorista" />
                      </SelectTrigger>
                      <SelectContent>
                        {motoristas.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data de entrega</Label>
                    <Input
                      type="date"
                      value={form.data_entrega}
                      onChange={(e) => setForm((f) => ({ ...f, data_entrega: e.target.value }))}
                    />
                  </div>
                  <p className="sm:col-span-2 text-xs text-muted-foreground">
                    Ao guardar: status → <strong>Em Uso</strong>
                    {editing?.motorista_id ? '; o motorista atual passa a Último.' : '.'}
                  </p>
                </div>
              )}

              {form.movimento === 'devolucao' && (
                <div className="grid gap-4 sm:grid-cols-2 rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-900/10">
                  <div className="space-y-1.5">
                    <Label>Motorista atual</Label>
                    <Input
                      readOnly
                      value={motoristaNome(form.motorista_id) || editing?.motorista?.nome || '—'}
                      className="bg-muted/50 text-muted-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data de devolução</Label>
                    <Input
                      type="date"
                      value={form.data_devolucao}
                      onChange={(e) => setForm((f) => ({ ...f, data_devolucao: e.target.value }))}
                    />
                  </div>
                  <p className="sm:col-span-2 text-xs text-muted-foreground">
                    Ao guardar: status → <strong>Disponível</strong>, o motorista passa a{' '}
                    <strong>Último</strong> e o cartão fica livre.
                  </p>
                </div>
              )}

              {form.movimento === 'nenhum' && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Motorista atual</Label>
                    <Select
                      value={form.motorista_id || '__none__'}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, motorista_id: v === '__none__' ? '' : v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sem motorista" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Sem motorista —</SelectItem>
                        {motoristas.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data de entrega</Label>
                    <Input
                      type="date"
                      value={form.data_entrega}
                      onChange={(e) => setForm((f) => ({ ...f, data_entrega: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data de devolução</Label>
                    <Input
                      type="date"
                      value={form.data_devolucao}
                      onChange={(e) => setForm((f) => ({ ...f, data_devolucao: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* ── Observações ── */}
            <section className="space-y-4 border-t pt-6">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" /> Observações
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Observações gerais</Label>
                  <Textarea
                    placeholder="Notas gerais sobre o cartão…"
                    value={form.notas}
                    onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Nota de devolução</Label>
                  <Textarea
                    placeholder="Estado do cartão na devolução, motivo…"
                    value={form.devolucao}
                    onChange={(e) => setForm((f) => ({ ...f, devolucao: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 border-t bg-muted/30 shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? 'Guardar' : 'Criar Cartão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ──────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cartão?</AlertDialogTitle>
            <AlertDialogDescription>
              O cartão <strong>{deleteTarget?.numero}</strong> ({deleteTarget?.tipo?.toUpperCase()})
              será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Import Dialog ───────────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={(o) => !o && setImportOpen(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-muted-foreground" />
              Importar Cartões Frota
            </DialogTitle>
          </DialogHeader>

          {(() => {
            const valid = importRows.filter((r) => r.erros.length === 0);
            const invalid = importRows.filter((r) => r.erros.length > 0);
            return (
              <>
                <div className="flex items-center gap-4 text-sm px-1">
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {valid.length} válido(s)
                  </span>
                  {invalid.length > 0 && (
                    <span className="flex items-center gap-1.5 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      {invalid.length} com erro — serão ignorado(s)
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Número</TableHead>
                        <TableHead>Âmbito</TableHead>
                        <TableHead className="text-right">Limite</TableHead>
                        <TableHead>Validade</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importRows.map((r) => {
                        const ok = r.erros.length === 0;
                        const info = r.tipo ? TIPO_INFO[r.tipo] : null;
                        return (
                          <TableRow key={r._row} className={!ok ? 'bg-destructive/5' : ''}>
                            <TableCell className="text-xs text-muted-foreground">
                              {r._row}
                            </TableCell>
                            <TableCell>
                              {info ? (
                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${info.badgeCls}`}
                                >
                                  {info.label}
                                </span>
                              ) : (
                                <span className="text-xs text-destructive">
                                  {String(r.tipo || '-')}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {r.numero || (
                                <span className="text-destructive text-xs">em falta</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {r.ambito || '-'}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {r.limite ? `${Number(r.limite).toFixed(2)} €` : '-'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {r.data_validade ? fmtDate(r.data_validade) : '-'}
                            </TableCell>
                            <TableCell>
                              {ok ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <span className="text-xs text-destructive">
                                  {r.erros.join(', ')}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setImportOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleImportConfirm} disabled={importing || valid.length === 0}>
                    {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Importar {valid.length} cartão(ões)
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── History Sheet ────────────────────────────────────────────────── */}
      <Sheet open={!!historyCartao} onOpenChange={(o) => !o && setHistoryCartao(null)}>
        <SheetContent className="w-full sm:max-w-2xl flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              <History className="h-5 w-5 text-muted-foreground" />
              Histórico de Consumo
              {historyCartao && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_INFO[historyCartao.tipo].badgeCls}`}
                >
                  {TIPO_INFO[historyCartao.tipo].label} · {historyCartao.numero}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          {loadingHistory ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : historico.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Sem transações registadas para este cartão.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto -mx-6 px-6 mt-4">
              <div className="flex justify-between items-center text-sm mb-3 px-1">
                <span className="text-muted-foreground">{historico.length} transação(ões)</span>
                <span className="font-semibold">{fmtEur(totalHistorico)}</span>
              </div>
              {historyCartao?.limite != null && (
                <div className="mb-3 px-1 text-xs text-muted-foreground">
                  Limite: <strong>{fmtEur(historyCartao.limite)}</strong>
                  {' · '}
                  Consumido:{' '}
                  <strong
                    className={
                      totalHistorico > historyCartao.limite ? 'text-destructive' : 'text-foreground'
                    }
                  >
                    {fmtEur(totalHistorico)}
                  </strong>
                  {' · '}
                  Disponível: <strong>{fmtEur(historyCartao.limite - totalHistorico)}</strong>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Posto</TableHead>
                    <TableHead>Combust.</TableHead>
                    <TableHead className="text-right">Litros</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {fmtDT(h.transaction_date)}
                      </TableCell>
                      <TableCell className="text-xs max-w-[140px] truncate">
                        {h.station_name || '-'}
                      </TableCell>
                      <TableCell className="text-xs">{h.fuel_type || '-'}</TableCell>
                      <TableCell className="text-xs text-right">
                        {h.quantity != null ? Number(h.quantity).toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-right font-medium">
                        {fmtEur(h.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
