import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  Car,
  Wifi,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Printer,
  FileDown,
  ChevronDown,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface Viatura {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
}

interface DispositivoObe {
  id: string;
  nr_equipamento: string;
  viatura_id: string | null;
  contrato: string | null;
  ativo: boolean;
  notas: string | null;
  viatura: { matricula: string; marca: string; modelo: string } | null;
}

interface HistoricoItem {
  transaction_date: string;
  amount: number;
  barreira_entrada: string | null;
  barreira_saida: string | null;
  operador: string | null;
  matricula: string | null;
  motorista_nome: string | null;
}

interface ImportRow {
  _row: number;
  nr_equipamento: string;
  contrato: string;
  matricula: string;
  notas: string;
  erros: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtEur = (v: number | null) =>
  v == null
    ? '-'
    : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
const fmtDT = (s: string | null) => {
  if (!s) return '-';
  try {
    return format(new Date(s), 'dd/MM/yyyy HH:mm', { locale: pt });
  } catch {
    return s.slice(0, 16);
  }
};
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function colKey(h: string) {
  return h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, '_');
}

const COL_MAP: Record<string, keyof Omit<ImportRow, '_row' | 'erros'>> = {
  nr_equipamento: 'nr_equipamento',
  equipamento: 'nr_equipamento',
  serial: 'nr_equipamento',
  numero: 'nr_equipamento',
  obe: 'nr_equipamento',
  dispositivo: 'nr_equipamento',
  contrato: 'contrato',
  contract: 'contrato',
  matricula: 'matricula',
  matrícula: 'matricula',
  viatura: 'matricula',
  plate: 'matricula',
  notas: 'notas',
  notes: 'notas',
  observacoes: 'notas',
  observações: 'notas',
};

function parseSheet(wb: XLSX.WorkBook, viaturas: Viatura[]): ImportRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  if (raw.length < 2) return [];

  const headers = (raw[0] as unknown[]).map((h) => colKey(String(h)));
  const fieldMap: Record<number, keyof Omit<ImportRow, '_row' | 'erros'>> = {};
  headers.forEach((h, i) => {
    if (COL_MAP[h]) fieldMap[i] = COL_MAP[h];
  });

  const matriculaMap = new Map(viaturas.map((v) => [v.matricula.toUpperCase(), v]));

  return (raw.slice(1) as unknown[][])
    .map((row, idx) => {
      const r: ImportRow = {
        _row: idx + 2,
        nr_equipamento: '',
        contrato: '',
        matricula: '',
        notas: '',
        erros: [],
      };
      row.forEach((cell, i) => {
        const field = fieldMap[i];
        if (field) (r as any)[field] = String(cell || '').trim();
      });
      if (!r.nr_equipamento) r.erros.push('Nº Equipamento em falta');
      if (r.matricula && !matriculaMap.has(r.matricula.toUpperCase()))
        r.erros.push(`Matrícula "${r.matricula}" não encontrada`);
      return r;
    })
    .filter((r) => r.nr_equipamento || r.matricula);
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Nr_Equipamento', 'Contrato', 'Matricula', 'Notas'],
    ['123456789', 'VV-12345', 'AA-00-AA', ''],
    ['987654321', '', 'BB-11-BB', 'OBE reserva'],
  ]);
  ws['!cols'] = [16, 12, 10, 20].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dispositivos OBE');
  XLSX.writeFile(wb, 'template_dispositivos_obe.xlsx');
}

// ── Component ─────────────────────────────────────────────────────────────────
type FormState = {
  nr_equipamento: string;
  viatura_id: string;
  contrato: string;
  ativo: boolean;
  notas: string;
};

const emptyForm = (): FormState => ({
  nr_equipamento: '',
  viatura_id: '',
  contrato: '',
  ativo: true,
  notas: '',
});

export function DispositivosObeTab() {
  const { toast } = useToast();
  const [dispositivos, setDispositivos] = useState<DispositivoObe[]>([]);
  const [viaturas, setViaturas] = useState<Viatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [apenasAtivos, setApenasAtivos] = useState(false);
  const [sortField, setSortField] = useState<string>('nr_equipamento');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // CRUD Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DispositivoObe | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<DispositivoObe | null>(null);

  // History Sheet
  const [historyDev, setHistoryDev] = useState<DispositivoObe | null>(null);
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
      const [{ data: devs, error: e1 }, { data: vits, error: e2 }] = await Promise.all([
        (supabase as any)
          .from('dispositivos_obe')
          .select('*, viatura:viatura_id(matricula, marca, modelo)')
          .order('nr_equipamento'),
        supabase.from('viaturas').select('id, matricula, marca, modelo').order('matricula'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setDispositivos(devs || []);
      setViaturas(vits || []);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const list = dispositivos.filter((d) => {
      if (apenasAtivos && !d.ativo) return false;
      if (!search) return true;
      const t = norm(search);
      return (
        norm(d.nr_equipamento).includes(t) ||
        norm(d.contrato || '').includes(t) ||
        norm(d.viatura?.matricula || '').includes(t) ||
        norm(d.viatura ? `${d.viatura.marca} ${d.viatura.modelo}` : '').includes(t)
      );
    });
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'nr_equipamento') {
        va = a.nr_equipamento;
        vb = b.nr_equipamento;
      } else if (sortField === 'contrato') {
        va = a.contrato || '';
        vb = b.contrato || '';
      } else if (sortField === 'viatura') {
        va = a.viatura?.matricula || '';
        vb = b.viatura?.matricula || '';
      } else if (sortField === 'estado') {
        va = a.ativo ? 0 : 1;
        vb = b.ativo ? 0 : 1;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [dispositivos, search, apenasAtivos, sortField, sortDir]);

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (d: DispositivoObe) => {
    setEditing(d);
    setForm({
      nr_equipamento: d.nr_equipamento,
      viatura_id: d.viatura_id || '',
      contrato: d.contrato || '',
      ativo: d.ativo,
      notas: d.notas || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nr_equipamento.trim()) {
      toast({ title: 'Nº Equipamento obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nr_equipamento: form.nr_equipamento.trim(),
        viatura_id: form.viatura_id || null,
        contrato: form.contrato || null,
        ativo: form.ativo,
        notas: form.notas || null,
      };
      const { error } = editing
        ? await (supabase as any).from('dispositivos_obe').update(payload).eq('id', editing.id)
        : await (supabase as any).from('dispositivos_obe').insert(payload);
      if (error) throw error;
      toast({ title: editing ? 'Dispositivo atualizado' : 'Dispositivo criado' });
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
      .from('dispositivos_obe')
      .delete()
      .eq('id', deleteTarget.id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Dispositivo eliminado' });
      carregar();
    }
    setDeleteTarget(null);
  };

  // ── History ───────────────────────────────────────────────────────────────
  const openHistory = async (d: DispositivoObe) => {
    setHistoryDev(d);
    setHistorico([]);
    setLoadingHistory(true);
    try {
      const { data, error } = await (supabase as any).rpc('get_obe_historico_portagens', {
        p_nr_equipamento: d.nr_equipamento,
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

  // ── Export / Print ───────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = filtered.map((d) => ({
      'Nº Equipamento': d.nr_equipamento,
      Contrato: d.contrato || '',
      'Viatura (Matrícula)': d.viatura?.matricula || '',
      'Viatura (Marca/Modelo)': d.viatura ? `${d.viatura.marca} ${d.viatura.modelo}` : '',
      Estado: d.ativo ? 'Ativo' : 'Inativo',
      Notas: d.notas || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dispositivos OBE');
    XLSX.writeFile(wb, `dispositivos_obe_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
    const ativos = filtered.filter((d) => d.ativo).length;
    const comViatura = filtered.filter((d) => d.viatura).length;
    const rows = filtered
      .map(
        (d) => `<tr>
      <td class="mono">${d.nr_equipamento}</td>
      <td>${d.contrato || '<span class="muted">-</span>'}</td>
      <td>${d.viatura ? `<strong>${d.viatura.matricula}</strong> <span class="muted">${d.viatura.marca} ${d.viatura.modelo}</span>` : '<span class="muted">Sem viatura</span>'}</td>
      <td><span class="badge ${d.ativo ? 'badge-ativo' : 'badge-inativo'}">${d.ativo ? 'Ativo' : 'Inativo'}</span></td>
    </tr>`
      )
      .join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document
      .write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dispositivos OBE — WeGest</title><link rel="icon" href="${logoUrl}" type="image/png">
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
            <h1>Dispositivos OBE Via Verde</h1>
            <p>Gestão de transponders para portagens</p>
          </div>
        </div>
        <div class="header-right"><div>Exportado em ${date}</div><div>${filtered.length} dispositivo(s) listados</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="lbl">Total</div><div class="val">${filtered.length}</div></div>
        <div class="stat"><div class="lbl">Ativos</div><div class="val">${ativos}</div></div>
        <div class="stat"><div class="lbl">Inativos</div><div class="val">${filtered.length - ativos}</div></div>
        <div class="stat"><div class="lbl">Com Viatura</div><div class="val">${comViatura}</div></div>
        <div class="stat"><div class="lbl">Sem Viatura</div><div class="val">${filtered.length - comViatura}</div></div>
      </div>
      <table>
        <thead><tr><th>Nº Equipamento</th><th>Contrato</th><th>Viatura</th><th>Estado</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer"><span>WeGest — Sistema de Gestão de Frotas</span><span>Gerado automaticamente em ${date}</span></div>
    </div>
    </body></html>`);
    w.document.close();
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array', cellDates: false });
        const rows = parseSheet(wb, viaturas);
        if (rows.length === 0) {
          toast({ title: 'Ficheiro vazio ou sem dados reconhecidos', variant: 'destructive' });
          return;
        }
        setImportRows(rows);
        setImportOpen(true);
      } catch {
        toast({
          title: 'Erro ao ler ficheiro',
          description: 'Certifique-se que é um .xlsx ou .xls válido.',
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
    const matriculaMap = new Map(viaturas.map((v) => [v.matricula.toUpperCase(), v.id]));
    setImporting(true);
    try {
      const { data: orgId } = await (supabase as any).rpc('get_current_org_id');
      const payload = valid.map((r) => ({
        org_id: orgId,
        nr_equipamento: r.nr_equipamento,
        contrato: r.contrato || null,
        viatura_id: r.matricula ? (matriculaMap.get(r.matricula.toUpperCase()) ?? null) : null,
        notas: r.notas || null,
      }));
      const { error } = await (supabase as any)
        .from('dispositivos_obe')
        .upsert(payload, { onConflict: 'org_id,nr_equipamento', ignoreDuplicates: false });
      if (error) throw error;
      toast({ title: `${valid.length} dispositivo(s) importado(s)/atualizado(s) com sucesso` });
      setImportOpen(false);
      carregar();
    } catch (err: any) {
      toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar equipamento, viatura, contrato…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Switch checked={apenasAtivos} onCheckedChange={setApenasAtivos} />
            Só ativos
          </label>
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
            Adicionar OBE
          </Button>
        </div>
      </div>
      <span className="text-sm text-muted-foreground">{filtered.length} dispositivo(s)</span>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          {dispositivos.length === 0
            ? 'Nenhum dispositivo OBE criado ainda. Clique em "Adicionar OBE".'
            : 'Nenhum dispositivo encontrado.'}
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
                    <SortTh field="nr_equipamento">Nº Equipamento</SortTh>
                    <SortTh field="contrato">Contrato</SortTh>
                    <SortTh field="viatura">Viatura</SortTh>
                    <SortTh field="estado">Estado</SortTh>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                );
              })()}
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono font-medium text-sm">
                    {d.nr_equipamento}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {d.contrato || '-'}
                  </TableCell>
                  <TableCell>
                    {d.viatura ? (
                      <span className="flex items-center gap-1.5 text-sm">
                        <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium">{d.viatura.matricula}</span>
                        <span className="text-muted-foreground text-xs">
                          {d.viatura.marca} {d.viatura.modelo}
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Sem viatura</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        d.ativo
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Wifi className="h-3 w-3" />
                      {d.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openHistory(d)}
                        title="Histórico de portagens"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(d)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(d)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── CRUD Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Dispositivo OBE' : 'Novo Dispositivo OBE'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Nº Equipamento *</Label>
                <Input
                  placeholder="Ex: 123456789"
                  value={form.nr_equipamento}
                  onChange={(e) => setForm((f) => ({ ...f, nr_equipamento: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Contrato Via Verde</Label>
              <Input
                placeholder="Ex: VV-12345"
                value={form.contrato}
                onChange={(e) => setForm((f) => ({ ...f, contrato: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Viatura Associada</Label>
              <Select
                value={form.viatura_id || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, viatura_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem viatura" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem viatura</SelectItem>
                  {viaturas.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.matricula} — {v.marca} {v.modelo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="ativo-switch"
                checked={form.ativo}
                onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
              />
              <Label htmlFor="ativo-switch" className="cursor-pointer">
                Dispositivo ativo
              </Label>
            </div>

            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea
                placeholder="Observações…"
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
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

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar dispositivo?</AlertDialogTitle>
            <AlertDialogDescription>
              O equipamento <strong>{deleteTarget?.nr_equipamento}</strong> será eliminado
              permanentemente.
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

      {/* ── Import Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={(o) => !o && setImportOpen(false)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-muted-foreground" />
              Importar Dispositivos OBE
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
                        <TableHead>Nº Equipamento</TableHead>
                        <TableHead>Contrato</TableHead>
                        <TableHead>Matrícula</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importRows.map((r) => {
                        const ok = r.erros.length === 0;
                        return (
                          <TableRow key={r._row} className={!ok ? 'bg-destructive/5' : ''}>
                            <TableCell className="text-xs text-muted-foreground">
                              {r._row}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {r.nr_equipamento || (
                                <span className="text-destructive text-xs">em falta</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {r.contrato || '-'}
                            </TableCell>
                            <TableCell className="text-sm">{r.matricula || '-'}</TableCell>
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
                    Importar {valid.length} dispositivo(s)
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── History Sheet ─────────────────────────────────────────────────── */}
      <Sheet open={!!historyDev} onOpenChange={(o) => !o && setHistoryDev(null)}>
        <SheetContent className="w-full sm:max-w-2xl flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              <History className="h-5 w-5 text-muted-foreground" />
              Histórico de Portagens
              {historyDev && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  OBE · {historyDev.nr_equipamento}
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
              Sem portagens registadas para este equipamento.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto -mx-6 px-6 mt-4">
              <div className="flex justify-between items-center text-sm mb-3 px-1">
                <span className="text-muted-foreground">{historico.length} portagem(ns)</span>
                <span className="font-semibold">{fmtEur(totalHistorico)}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead>Saída</TableHead>
                    <TableHead>Motorista</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {fmtDT(h.transaction_date)}
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">
                        {h.barreira_entrada || '-'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">
                        {h.barreira_saida || '-'}
                      </TableCell>
                      <TableCell className="text-xs">{h.motorista_nome || '-'}</TableCell>
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
