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

interface CartaoFrota {
  id: string;
  numero: string;
  tipo: 'bp' | 'repsol' | 'edp';
  motorista_id: string | null;
  cliente_id: string | null;
  ativo: boolean;
  data_validade: string | null;
  limite: number | null;
  pin: string | null;
  ambito: string | null;
  detentor: string | null;
  notas: string | null;
  devolucao: string | null;
  motorista: { nome: string } | null;
  cliente: { nome: string } | null;
}

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
    ['Tipo', 'Numero', 'Ambito', 'Limite', 'PIN', 'Validade', 'Detentor do Cartão', 'Notas', 'Devolução'],
    ['bp', '1234567890', 'Nacional', '200', '1234', '31/12/2026', 'DISTÂNCIA 01', '', ''],
    ['repsol', '9876543210', 'Nacional', '', '', '', 'DISTÂNCIA 02', '', ''],
    ['edp', '5551234567', 'Nacional', '150', '', '30/06/2027', 'DISTÂNCIA 03', 'Carreg. rápido', ''],
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
});

export function CartoesFlotaTab() {
  const { toast } = useToast();
  const [cartoes, setCartoes] = useState<CartaoFrota[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'todos' | 'bp' | 'repsol' | 'edp'>('todos');
  const [sortField, setSortField] = useState<string>('numero');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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
  }, []);

  const carregar = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('cartoes_frota')
        .select('*, motorista:motorista_id(nome), cliente:cliente_id(nome)')
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

  const filtered = useMemo(() => {
    const list = cartoes.filter((c) => {
      if (tipoFilter !== 'todos' && c.tipo !== tipoFilter) return false;
      if (!search) return true;
      const t = norm(search);
      return (
        norm(c.numero).includes(t) ||
        norm(c.motorista?.nome || '').includes(t) ||
        norm(c.cliente?.nome || '').includes(t) ||
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
      } else if (sortField === 'ambito') {
        va = a.ambito || '';
        vb = b.ambito || '';
      } else if (sortField === 'titular') {
        va = a.motorista?.nome || a.cliente?.nome || '';
        vb = b.motorista?.nome || b.cliente?.nome || '';
      } else if (sortField === 'limite') {
        va = a.limite ?? -Infinity;
        vb = b.limite ?? -Infinity;
      } else if (sortField === 'validade') {
        va = a.data_validade || '';
        vb = b.data_validade || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [cartoes, search, tipoFilter, sortField, sortDir]);

  // ── CRUD ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowPin(false);
    setDialogOpen(true);
  };

  const openEdit = (c: CartaoFrota) => {
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
    });
    setShowPin(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.numero.trim()) {
      toast({ title: 'Número obrigatório', variant: 'destructive' });
      return;
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
        devolucao: form.devolucao || null,
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
      'Limite (€)': c.limite ?? '',
      Validade: c.data_validade ? fmtDate(c.data_validade) : '',
      Estado: c.ativo ? 'Ativo' : 'Inativo',
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
    const ativos = filtered.filter((c) => c.ativo).length;
    const bpCount = filtered.filter((c) => c.tipo === 'bp').length;
    const repsolCount = filtered.filter((c) => c.tipo === 'repsol').length;
    const edpCount = filtered.filter((c) => c.tipo === 'edp').length;
    const rows = filtered
      .map((c) => {
        const t = titularLabel(c);
        const badgeCls =
          c.tipo === 'bp' ? 'badge-bp' : c.tipo === 'repsol' ? 'badge-repsol' : 'badge-edp';
        return `<tr>
        <td><span class="badge ${badgeCls}">${TIPO_INFO[c.tipo].label}</span></td>
        <td class="mono">${c.numero}</td>
        <td>${c.ambito || '<span class="muted">-</span>'}</td>
        <td>${t ? t.texto : '<span class="muted">Disponível</span>'}</td>
        <td style="text-align:right">${c.limite != null ? fmtEur(c.limite) : '<span class="muted">-</span>'}</td>
        <td>${fmtDate(c.data_validade)}</td>
        <td><span class="badge ${c.ativo ? 'badge-ativo' : 'badge-inativo'}">${c.ativo ? 'Ativo' : 'Inativo'}</span></td>
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
      .stats{display:flex;gap:12px;margin-bottom:20px}
      .stat{border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;min-width:80px}
      .stat .lbl{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
      .stat .val{font-size:22px;font-weight:700;color:#111827}
      table{width:100%;border-collapse:collapse}
      thead th{background:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:2px solid #d1d5db;padding:8px 10px;text-align:left;font-weight:600;color:#374151;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em}
      tbody td{border-bottom:1px solid #f3f4f6;padding:7px 10px}
      tbody tr:nth-child(even) td{background:#f9fafb}
      .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:9px;font-weight:600}
      .badge-bp{background:#d1fae5;color:#065f46}
      .badge-repsol{background:#ffedd5;color:#9a3412}
      .badge-edp{background:#ede9fe;color:#5b21b6}
      .badge-ativo{background:#d1fae5;color:#065f46}
      .badge-inativo{background:#f3f4f6;color:#6b7280}
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
            <p>Gestão de cartões de combustível e eletricidade</p>
          </div>
        </div>
        <div class="header-right"><div>Exportado em ${date}</div><div>${filtered.length} cartão(ões) listados</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="lbl">Total</div><div class="val">${filtered.length}</div></div>
        <div class="stat"><div class="lbl">Ativos</div><div class="val">${ativos}</div></div>
        <div class="stat"><div class="lbl">BP</div><div class="val">${bpCount}</div></div>
        <div class="stat"><div class="lbl">Repsol</div><div class="val">${repsolCount}</div></div>
        <div class="stat"><div class="lbl">EDP</div><div class="val">${edpCount}</div></div>
      </div>
      <table>
        <thead><tr><th>Tipo</th><th>Número</th><th>Âmbito</th><th>Titular</th><th style="text-align:right">Limite</th><th>Validade</th><th>Estado</th></tr></thead>
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
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar número, titular, âmbito…"
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
                    <SortTh field="ambito">Âmbito</SortTh>
                    <SortTh field="titular">Titular</SortTh>
                    <SortTh field="limite" className="text-right">
                      Limite
                    </SortTh>
                    <SortTh field="validade">Validade</SortTh>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                );
              })()}
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const info = TIPO_INFO[c.tipo];
                const Icon = info.Icon;
                const titular = titularLabel(c);
                return (
                  <TableRow key={c.id}>
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
                      {c.ambito || '-'}
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
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(c.data_validade)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
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

      {/* ── CRUD Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Cartão Frota' : 'Novo Cartão Frota'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Tipo + Número */}
            <div className="grid grid-cols-2 gap-3">
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
                <Label>Número *</Label>
                <Input
                  placeholder="Ex: 1234567890"
                  value={form.numero}
                  onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
                />
              </div>
            </div>

            {/* Âmbito */}
            <div className="space-y-1.5">
              <Label>Âmbito</Label>
              <Input
                placeholder="Ex: Combustível, Elétrico, Geral…"
                value={form.ambito}
                onChange={(e) => setForm((f) => ({ ...f, ambito: e.target.value }))}
              />
            </div>

            {/* Limite + Validade */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Limite (€)</Label>
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
                <Label>Data de Validade</Label>
                <Input
                  type="date"
                  value={form.data_validade}
                  onChange={(e) => setForm((f) => ({ ...f, data_validade: e.target.value }))}
                />
              </div>
            </div>

            {/* PIN */}
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

            {/* Detentor */}
            <div className="space-y-1.5">
              <Label>Detentor do Cartão</Label>
              <Input
                placeholder="Ex: DISTÂNCIA 01, João Silva…"
                value={form.detentor}
                onChange={(e) => setForm((f) => ({ ...f, detentor: e.target.value }))}
              />
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                placeholder="Notas gerais sobre o cartão…"
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Devolução */}
            <div className="space-y-1.5">
              <Label>Devolução</Label>
              <Textarea
                placeholder="Observações sobre a devolução do cartão…"
                value={form.devolucao}
                onChange={(e) => setForm((f) => ({ ...f, devolucao: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? 'Guardar' : 'Criar'}
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
