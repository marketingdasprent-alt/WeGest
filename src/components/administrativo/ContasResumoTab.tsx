import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, isThisWeek } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Loader2,
  Search,
  Calendar,
  Users,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Upload,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MotoristaResumoDialog } from './MotoristaResumoDialog';
import { ImportarDadosWizard } from './ImportarDadosWizard';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Printer,
  Mail,
  Send,
  FileDown,
  ChevronDown,
  FileText,
  Files,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Settings,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { generateFinanceiroPDF } from '@/utils/generateFinanceiroPDF';
import { generateContasConsolidadoPDF } from '@/utils/generateContasConsolidadoPDF';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useIsMobile } from '@/hooks/use-mobile';
import { cn, matchesSearch } from '@/lib/utils';

interface MotoristaResumo {
  /** id único estável por linha — usar SEMPRE para selectedIds, react keys, filtros.
   *  Preenchido em loadResumos antes de setResumos. */
  _uid?: string;
  driver_name: string;
  driver_uuid: string;
  motorista_id?: string;
  total_faturado: number;
  faturado_bolt: number;
  faturado_uber: number;
  total_viagens: number;
  viagens_bolt: number;
  viagens_uber: number;
  recibo_verde: boolean;
  liquido: number;
  combustivel: number;
  portagens: number;
  reparacoes: number;
  outros_custos: number;
  aluguer: number;
}

// Semana: Segunda (1) a Domingo (0)
const WEEK_STARTS_ON = 1;

// Atalhos rápidos para seleção de semanas
const getWeekShortcuts = () => [
  { label: 'Esta semana', date: new Date() },
  { label: 'Semana passada', date: subWeeks(new Date(), 1) },
  { label: 'Há 2 semanas', date: subWeeks(new Date(), 2) },
  { label: 'Há 3 semanas', date: subWeeks(new Date(), 3) },
];

export function ContasResumoTab() {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [resumos, setResumos] = useState<MotoristaResumo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  // Estado: data dentro da semana selecionada
  const [selectedWeek, setSelectedWeek] = useState<Date>(subWeeks(new Date(), 1));
  const [selectedMotorista, setSelectedMotorista] = useState<MotoristaResumo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [importarWizardOpen, setImportarWizardOpen] = useState(false);
  const [motoristasList, setMotoristasList] = useState<Array<{ id: string; nome: string }>>([]);
  const [rendaAluguerSemana, setRendaAluguerSemana] = useState(0);
  const logoSrc = useThemedLogo();

  // Maps for extra print data and filters
  const [gestorMap, setGestorMap] = useState<Record<string, string>>({});
  const [matriculaMap, setMatriculaMap] = useState<Record<string, string>>({});
  const [dataContratacaoMap, setDataContratacaoMap] = useState<Record<string, string>>({});
  const [statusAtivoMap, setStatusAtivoMap] = useState<Record<string, boolean>>({});

  // Print settings (persisted)
  const PRINT_KEY = 'contas_print_settings';
  const [printSettings, setPrintSettings] = useState(() => {
    try {
      return {
        ...{ orientacao: 'portrait', mostrarGestor: false, mostrarMatricula: false },
        ...JSON.parse(localStorage.getItem(PRINT_KEY) || '{}'),
      };
    } catch {
      return { orientacao: 'portrait', mostrarGestor: false, mostrarMatricula: false };
    }
  });
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const updatePrintSetting = (key: string, val: any) => {
    const next = { ...printSettings, [key]: val };
    setPrintSettings(next);
    localStorage.setItem(PRINT_KEY, JSON.stringify(next));
  };

  // Sorting
  type SortField =
    | 'driver_name'
    | 'total_faturado'
    | 'liquido'
    | 'aluguer'
    | 'combustivel'
    | 'portagens'
    | 'outros_custos'
    | 'reparacoes';
  const [sortField, setSortField] = useState<SortField>('total_faturado');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Filter: recibo verde
  const [filterRecibo, setFilterRecibo] = useState<'todos' | 'verde' | 'nao_verde'>('todos');
  // Filter: saldo
  const [filterSaldo, setFilterSaldo] = useState<'todos' | 'negativos' | 'positivos'>('todos');
  // Filter: gestor
  const [filterGestor, setFilterGestor] = useState<string>('todos');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handleBulkPrint = async () => {
    if (selectedIds.size === 0) return;

    setLoading(true);
    const total = selectedIds.size;
    const progressToastId = toast.loading(`A gerar 0 / ${total} relatórios…`);

    try {
      const selectedResumos = resumos.filter((r) => !!r._uid && selectedIds.has(r._uid));

      let combinedPdf = null;

      for (let i = 0; i < selectedResumos.length; i++) {
        const motorista = selectedResumos[i];

        let matricula = null;
        let cartaoFrota = null;
        let extraCosts = { caucao: 0, seguros: 0, outros: 0 };

        const resolvedMotoristaId = motorista.motorista_id || null;
        if (resolvedMotoristaId) {
          const [vData, mData, aData] = await Promise.all([
            supabase
              .from('motorista_viaturas')
              .select('motorista_id, viaturas(matricula)')
              .eq('motorista_id', resolvedMotoristaId)
              .eq('status', 'ativo')
              .maybeSingle(),
            supabase
              .from('motoristas_ativos')
              .select('id, cartao_frota, cartao_bp, cartao_repsol, cartao_edp')
              .eq('id', resolvedMotoristaId)
              .maybeSingle(),
            supabase
              .from('motorista_custos_adicionais')
              .select('motorista_id, tipo, valor')
              .eq('motorista_id', resolvedMotoristaId)
              .gte('semana_referencia', format(weekStart, 'yyyy-MM-dd'))
              .lte('semana_referencia', format(weekEnd, 'yyyy-MM-dd')),
          ]);

          if (vData.data?.viaturas) matricula = (vData.data.viaturas as any).matricula;
          if (mData.data) {
            cartaoFrota =
              [
                mData.data.cartao_bp,
                mData.data.cartao_repsol,
                mData.data.cartao_edp,
                mData.data.cartao_frota,
              ]
                .filter((c) => !!c)
                .join(' / ') || 'N/A';
          }
          if (aData.data) {
            extraCosts = aData.data.reduce(
              (acc, curr) => {
                const val = Number(curr.valor) || 0;
                if (curr.tipo === 'Caução') acc.caucao += val;
                else if (curr.tipo === 'Seguros') acc.seguros += val;
                else acc.outros += val;
                return acc;
              },
              { caucao: 0, seguros: 0, outros: 0 }
            );
          }
        }

        const receitaAjustada = motorista.recibo_verde
          ? motorista.total_faturado
          : motorista.total_faturado / 1.06;
        const totalDespesas =
          motorista.aluguer +
          motorista.combustivel +
          motorista.portagens +
          motorista.reparacoes +
          extraCosts.outros +
          extraCosts.caucao +
          extraCosts.seguros;

        const pdfData = {
          driver_name: motorista.driver_name,
          matricula,
          cartaoFrota,
          dateRange: { from: weekStart, to: weekEnd },
          recibo_verde: motorista.recibo_verde,
          receitas: {
            bolt: motorista.faturado_bolt,
            uber: motorista.faturado_uber,
            outras_receitas: 0,
            total: motorista.total_faturado,
          },
          despesas: {
            aluguer: motorista.aluguer,
            combustivel: motorista.combustivel,
            portagens: motorista.portagens,
            reparacoes: motorista.reparacoes,
            outros: extraCosts.outros + extraCosts.caucao + extraCosts.seguros,
            total: totalDespesas,
          },
          resumo: {
            totalAReceber: receitaAjustada - (motorista.recibo_verde ? 0 : 0),
            ajuste: motorista.recibo_verde ? undefined : motorista.total_faturado - receitaAjustada,
            liquido: motorista.liquido,
          },
          logoSrc,
        };

        combinedPdf = await generateFinanceiroPDF(pdfData, combinedPdf || undefined);

        if ((i + 1) % 10 === 0 || i + 1 === selectedResumos.length) {
          toast.loading(`A gerar ${i + 1} / ${total} relatórios…`, { id: progressToastId });
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (combinedPdf) {
        const fileName = `resumos_financeiros_${format(weekStart, 'yyyyMMdd')}.pdf`;
        combinedPdf.save(fileName);
        toast.success(`${selectedResumos.length} relatórios gerados.`, { id: progressToastId });
      } else {
        toast.error('Nenhum relatório foi gerado.', { id: progressToastId });
      }
    } catch (error) {
      console.error('Erro ao imprimir em massa:', error);
      toast.error('Erro ao gerar relatórios', { id: progressToastId });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPrintConsolidado = async () => {
    if (selectedIds.size === 0) return;
    const selectedResumos = resumos.filter((r) => !!r._uid && selectedIds.has(r._uid));
    if (selectedResumos.length === 0) return;

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

    const fmtEur = (v: number) =>
      new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
    const periodoLabel = `${format(weekStart, 'dd/MM/yyyy', { locale: pt })} — ${format(weekEnd, 'dd/MM/yyyy', { locale: pt })}`;
    const date = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: pt });

    const totalFaturado = selectedResumos.reduce((s, r) => s + r.total_faturado, 0);
    const totalLiquido = selectedResumos.reduce((s, r) => s + r.liquido, 0);
    const totalAluguer = selectedResumos.reduce((s, r) => s + r.aluguer, 0);
    const totalCombust = selectedResumos.reduce((s, r) => s + r.combustivel, 0);

    const rows = selectedResumos
      .map(
        (r) => `<tr>
      <td>${r.driver_name}</td>
      <td style="text-align:right">${fmtEur(r.total_faturado)}</td>
      <td style="text-align:right">${fmtEur(r.combustivel)}</td>
      <td style="text-align:right">${fmtEur(r.portagens)}</td>
      <td style="text-align:right">${fmtEur(r.reparacoes)}</td>
      <td style="text-align:right">${fmtEur(r.outros_custos)}</td>
      <td style="text-align:right">${fmtEur(r.aluguer)}</td>
      <td style="text-align:right;font-weight:600">${fmtEur(r.liquido)}</td>
    </tr>`
      )
      .join('');

    const w = window.open('', '_blank');
    if (!w) return;
    w.document
      .write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resumos Semanais — WeGest</title><link rel="icon" href="${logoUrl}" type="image/png">
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
      .stat{border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;min-width:100px}
      .stat .lbl{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
      .stat .val{font-size:16px;font-weight:700;color:#111827;margin-top:2px}
      table{width:100%;border-collapse:collapse}
      thead th{background:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:2px solid #d1d5db;padding:8px 10px;text-align:left;font-weight:600;color:#374151;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em}
      thead th.r{text-align:right}
      tbody td{border-bottom:1px solid #f3f4f6;padding:7px 10px}
      tbody tr:nth-child(even) td{background:#f9fafb}
      tfoot td{border-top:2px solid #d1d5db;padding:8px 10px;font-weight:700;font-size:11px}
      tfoot td.r{text-align:right}
      .footer{margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#9ca3af}
      @media print{body{margin:0}.page{padding:16px 20px}@page{margin:10mm}}
    </style></head><body onload="window.print()">
    <div class="page">
      <div class="header">
        <div class="header-left">
          <img src="${logoUrl}" alt="WeGest" class="header-logo" />
          <div class="header-title">
            <h1>Resumos Semanais</h1>
            <p>${periodoLabel}</p>
          </div>
        </div>
        <div class="header-right"><div>Exportado em ${date}</div><div>${selectedResumos.length} motorista(s) selecionado(s)</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="lbl">Motoristas</div><div class="val">${selectedResumos.length}</div></div>
        <div class="stat"><div class="lbl">Total Faturado</div><div class="val">${fmtEur(totalFaturado)}</div></div>
        <div class="stat"><div class="lbl">Líquido</div><div class="val">${fmtEur(totalLiquido)}</div></div>
        <div class="stat"><div class="lbl">Aluguer</div><div class="val">${fmtEur(totalAluguer)}</div></div>
        <div class="stat"><div class="lbl">Combustível</div><div class="val">${fmtEur(totalCombust)}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Motorista</th><th class="r">Faturado</th><th class="r">Combustível</th>
          <th class="r">Portagens</th><th class="r">Reparações</th><th class="r">Outros</th>
          <th class="r">Aluguer</th><th class="r">Líquido</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td>Total</td>
          <td class="r">${fmtEur(totalFaturado)}</td>
          <td class="r">${fmtEur(totalCombust)}</td>
          <td class="r">${fmtEur(selectedResumos.reduce((s, r) => s + r.portagens, 0))}</td>
          <td class="r">${fmtEur(selectedResumos.reduce((s, r) => s + r.reparacoes, 0))}</td>
          <td class="r">${fmtEur(selectedResumos.reduce((s, r) => s + r.outros_custos, 0))}</td>
          <td class="r">${fmtEur(totalAluguer)}</td>
          <td class="r">${fmtEur(totalLiquido)}</td>
        </tr></tfoot>
      </table>
      <div class="footer"><span>WeGest — Sistema de Gestão de Frotas</span><span>Gerado automaticamente em ${date}</span></div>
    </div>
    </body></html>`);
    w.document.close();
  };

  const handleBulkEmail = async () => {
    toast.info('Funcionalidade de envio em massa por email em desenvolvimento.');
  };

  // Calcular início e fim da semana (Segunda a Domingo)
  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });

  const weekShortcuts = getWeekShortcuts();

  // Navegação de semanas
  const goToPreviousWeek = () => setSelectedWeek(subWeeks(selectedWeek, 1));
  const goToNextWeek = () => setSelectedWeek(addWeeks(selectedWeek, 1));

  // Verificar se é a semana actual
  const isCurrentWeek = isThisWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });

  const handleRowClick = (resumo: MotoristaResumo) => {
    setSelectedMotorista(resumo);
    setDialogOpen(true);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredResumos.length) {
      setSelectedIds(new Set());
    } else {
      const allIds = filteredResumos.map((r) => r._uid).filter((u): u is string => !!u);
      setSelectedIds(new Set(allIds));
    }
  };

  const toggleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDayClick = (day: Date | undefined) => {
    if (day) {
      setSelectedWeek(day);
    }
  };

  const getWeekLabel = () => {
    const label = `${format(weekStart, 'dd/MM', { locale: pt })} - ${format(weekEnd, 'dd/MM/yyyy', { locale: pt })}`;
    if (isCurrentWeek) {
      return `${label} (Semana Actual)`;
    }
    return label;
  };

  useEffect(() => {
    loadResumos();
  }, [selectedWeek]);

  // Normalizar nome para matching (lowercase, sem acentos, sem espaços extra)
  function normalizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Extrair primeiro+último nome normalizado para dedup
  function normalizeFirstLast(name: string): string {
    const parts = normalizeName(name).split(' ');
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[parts.length - 1]}`;
    }
    return parts[0] || '';
  }

  // Função para verificar se um nome da plataforma corresponde a um motorista cadastrado
  function isNameMatch(platformName: string, officialName: string): boolean {
    const pNorm = normalizeName(platformName);
    const oNorm = normalizeName(officialName);

    // 1. Match exato (normalizado)
    if (pNorm === oNorm) return true;

    // 2. Primeiro + Último correponde? (Ex: Alysson Caldeira vs Alysson Caldeira)
    const pFL = normalizeFirstLast(platformName);
    const oFL = normalizeFirstLast(officialName);
    if (pFL === oFL && pFL.includes(' ')) return true;

    // 3. O nome da plataforma está contido no nome oficial? (Ex: Alysson Caldeira contido em Alysson Geraldo Gomes Caldeira)
    if (oNorm.includes(pNorm) && pNorm.length > 5) return true;

    // 4. O nome oficial está contido no nome da plataforma? (Inverso)
    if (pNorm.includes(oNorm) && oNorm.length > 5) return true;

    // 5. Match individual de nomes (pelo menos 2 nomes em comum, ignorando preposições)
    const noise = ['da', 'de', 'do', 'das', 'dos', 'e'];
    const pParts = pNorm.split(' ').filter((p) => p.length > 2 && !noise.includes(p));
    const oParts = oNorm.split(' ').filter((p) => p.length > 2 && !noise.includes(p));

    const commonParts = pParts.filter((p) => oParts.includes(p));
    if (commonParts.length >= 2) return true;

    // 6. Caso especial: Um só nome mas é muito longo e único? (Opcional, manter seguro)
    if (pParts.length === 1 && oParts.includes(pParts[0]) && pParts[0].length > 7) return true;

    return false;
  }

  async function loadResumos() {
    setLoading(true);
    try {
      // 1. Buscar bolt_drivers → motorista_id + recibo_verde + nome
      const { data: driversData } = await supabase
        .from('bolt_drivers')
        .select('driver_uuid, motorista_id, name, motoristas_ativos(id, nome, recibo_verde)');

      // Mapa: bolt driver_uuid → motorista_id
      const boltToMotoristaMap: Record<string, string> = {};
      // Mapa: motorista_id → recibo_verde
      const reciboVerdeMap: Record<string, boolean> = {};
      // Mapa: motorista_id → nome display (do bolt ou do motoristas_ativos)
      const motoristaNameMap: Record<string, string> = {};

      (driversData || []).forEach((d) => {
        const motData = d.motoristas_ativos as {
          id: string;
          nome: string;
          recibo_verde: boolean | null;
        } | null;
        if (d.driver_uuid && d.motorista_id) {
          boltToMotoristaMap[d.driver_uuid] = d.motorista_id;
          reciboVerdeMap[d.motorista_id] = motData?.recibo_verde ?? true;
          motoristaNameMap[d.motorista_id] = d.name || motData?.nome || 'Desconhecido';
        }
      });

      // 2. Buscar todos motoristas_ativos para matching (Nomes e IDs de plataforma)
      const { data: todosMotoristas } = await supabase
        .from('motoristas_ativos')
        .select(
          'id, nome, recibo_verde, uber_uuid, bolt_id, gestor_responsavel, data_contratacao, status_ativo, created_at'
        );

      // Mapa: uber_uuid -> motorista_id
      const uberIdMap: Record<string, string> = {};
      // Mapa: bolt_id -> motorista_id
      const boltIdMap: Record<string, string> = {};

      // Mapa: nome normalizado → motorista_id
      const nomeToMotoristaMap: Record<
        string,
        { id: string; nome: string; recibo_verde: boolean }
      > = {};
      // Mapa: motorista_id → nome canónico do CRM (fonte de verdade do nome a exibir)
      const crmNomeById: Record<string, string> = {};
      (todosMotoristas || []).forEach((m) => {
        const norm = normalizeName(m.nome);
        nomeToMotoristaMap[norm] = { id: m.id, nome: m.nome, recibo_verde: m.recibo_verde ?? true };
        crmNomeById[m.id] = m.nome;

        // Mapear IDs de plataforma se existirem
        if (m.uber_uuid) uberIdMap[m.uber_uuid] = m.id;
        if (m.bolt_id) boltIdMap[m.bolt_id] = m.id;

        // Também guardar recibo_verde para qualquer motorista
        if (!(m.id in reciboVerdeMap)) {
          reciboVerdeMap[m.id] = m.recibo_verde ?? true;
        }
      });

      // 3. Buscar viagens Bolt
      let boltQuery = supabase
        .from('bolt_viagens')
        .select('driver_name, driver_uuid, driver_earnings, order_status, integracao_id')
        .gt('driver_earnings', 0)
        .gte('payment_confirmed_timestamp', weekStart.toISOString())
        .lte('payment_confirmed_timestamp', weekEnd.toISOString());

      // 4. Buscar transações Uber no mesmo período
      let uberQuery = supabase
        .from('uber_transactions')
        .select('uber_driver_id, gross_amount, raw_transaction')
        .gte('occurred_at', weekStart.toISOString())
        .lte('occurred_at', weekEnd.toISOString());

      // 4b. Buscar atividade Uber (viagens_concluidas reais) para o período
      // Gerar período normalizado: Segunda → Domingo (YYYYMMDD-YYYYMMDD)
      const fmtD = (d: Date) =>
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const periodoStr = `${fmtD(weekStart)}-${fmtD(weekEnd)}`;
      let atividadeQuery = supabase
        .from('uber_atividade_motoristas')
        .select('uber_driver_id, viagens_concluidas')
        .eq('periodo', periodoStr);

      // 4c. Buscar uber_drivers para mapeamento uber_driver_id → motorista_id
      const uberDriversQuery = supabase
        .from('uber_drivers')
        .select('uber_driver_id, motorista_id, full_name');

      // 4d. Buscar transações de combustível no período
      let combustivelQuery = (supabase as any)
        .from('bp_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStart.toISOString())
        .lte('transaction_date', weekEnd.toISOString())
        .not('motorista_id', 'is', null);

      let repsolQuery = supabase
        .from('repsol_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStart.toISOString())
        .lte('transaction_date', weekEnd.toISOString())
        .not('motorista_id', 'is', null);

      let edpQuery = supabase
        .from('edp_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStart.toISOString())
        .lte('transaction_date', weekEnd.toISOString())
        .not('motorista_id', 'is', null);

      // 4d-ter. Buscar portagens Via Verde no período
      const viaVerdeQuery = (supabase as any)
        .from('via_verde_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStart.toISOString())
        .lte('transaction_date', weekEnd.toISOString())
        .not('motorista_id', 'is', null);

      // 4d-bis. Buscar valor de aluguer de viatura (bulk) para todos os motoristas activos
      const viaturasQuery = supabase
        .from('motorista_viaturas')
        .select('motorista_id, viaturas(valor_aluguer, matricula)')
        .eq('status', 'ativo');

      // 4e. Buscar resumos semanais Bolt (dados CSV) cujo intervalo intersecte a semana seleccionada
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

      // 4f. Buscar movimentos financeiros unificados para a semana
      const financeiroQuery = supabase
        .from('motorista_financeiro')
        .select('motorista_id, valor, categoria, tipo')
        .gte('data_movimento', weekStartStr)
        .lte('data_movimento', weekEndStr)
        .eq('status', 'pendente');

      let boltResumosQuery = supabase
        .from('bolt_resumos_semanais')
        .select(
          'motorista_id, motorista_nome, ganhos_liquidos, viagens_terminadas, integracao_id, identificador_motorista'
        )
        .lte('periodo_inicio', weekEndStr)
        .gte('periodo_fim', weekStartStr);

      const [
        boltResult,
        uberResult,
        atividadeResult,
        uberDriversResult,
        combustivelResult,
        repsolResult,
        edpResult,
        boltResumosResult,
        financeiroResult,
        viaturasResult,
        viaVerdeResult,
      ] = await Promise.all([
        boltQuery,
        uberQuery,
        atividadeQuery,
        uberDriversQuery,
        combustivelQuery,
        repsolQuery,
        edpQuery,
        boltResumosQuery,
        financeiroQuery,
        viaturasQuery,
        viaVerdeQuery,
      ]);

      if (boltResult.error) throw boltResult.error;
      if (uberResult.error) throw uberResult.error;

      // Mapa: motorista_id → total combustível gasto no período
      const combustivelByMotorista: Record<string, number> = {};

      const somarCombustivel = (resultado: any) => {
        (resultado.data || []).forEach((t: any) => {
          if (t.motorista_id) {
            combustivelByMotorista[t.motorista_id] =
              (combustivelByMotorista[t.motorista_id] || 0) + (Number(t.amount) || 0);
          }
        });
      };

      somarCombustivel(combustivelResult);
      somarCombustivel(repsolResult);
      somarCombustivel(edpResult);

      // Mapa: motorista_id → total portagens Via Verde no período
      const portagensByMotorista: Record<string, number> = {};
      ((viaVerdeResult as any)?.data || []).forEach((t: any) => {
        if (t.motorista_id) {
          portagensByMotorista[t.motorista_id] =
            (portagensByMotorista[t.motorista_id] || 0) + (Number(t.amount) || 0);
        }
      });

      // Guardar lista de motoristas para o dialog de importação
      setMotoristasList((todosMotoristas || []).map((m) => ({ id: m.id, nome: m.nome })));

      // Mapas auxiliares para impressão (gestor + matrícula) e filtros
      const gMap: Record<string, string> = {};
      const dcMap: Record<string, string> = {};
      const saMap: Record<string, boolean> = {};
      (todosMotoristas || []).forEach((m: any) => {
        if (m.gestor_responsavel) gMap[m.id] = m.gestor_responsavel;
        // Usar data_contratacao se disponível, senão usar created_at (sempre preenchido)
        dcMap[m.id] = m.data_contratacao || m.created_at;
        saMap[m.id] = m.status_ativo !== false;
      });
      setGestorMap(gMap);
      setDataContratacaoMap(dcMap);
      setStatusAtivoMap(saMap);
      const mMap: Record<string, string> = {};
      (viaturasResult.data || []).forEach((mv: any) => {
        if (mv.motorista_id && (mv.viaturas as any)?.matricula)
          mMap[mv.motorista_id] = (mv.viaturas as any).matricula;
      });
      setMatriculaMap(mMap);

      // Mapa: motorista_id → valor semanal de aluguer de viatura
      const aluguerByMotorista: Record<string, number> = {};
      (viaturasResult.data || []).forEach((mv: any) => {
        if (mv.motorista_id && mv.viaturas?.valor_aluguer) {
          aluguerByMotorista[mv.motorista_id] = Number(mv.viaturas.valor_aluguer) || 0;
        }
      });

      // Mapa: motorista_id → total reparações da semana
      const reparacoesByMotorista: Record<string, number> = {};
      // Mapa: motorista_id → total outros custos (débitos)
      const adhocByMotorista: Record<string, number> = {};
      // Mapa: motorista_id → ganhos extras (créditos)
      const extrasByMotorista: Record<string, number> = {};

      let rendaAluguerTotal = 0;

      (financeiroResult.data || []).forEach((m: any) => {
        if (!m.motorista_id) return;
        const val = Number(m.valor) || 0;

        if (m.tipo === 'credito') {
          // Não incluir caução como receita/crédito no recibo semanal
          if (m.categoria === 'caucao') return;
          extrasByMotorista[m.motorista_id] = (extrasByMotorista[m.motorista_id] || 0) + val;
          return;
        }

        // De aqui em diante são só débitos
        if (m.categoria === 'reparacao') {
          reparacoesByMotorista[m.motorista_id] =
            (reparacoesByMotorista[m.motorista_id] || 0) + val;
        } else if (m.categoria === 'renda_viatura') {
          aluguerByMotorista[m.motorista_id] = (aluguerByMotorista[m.motorista_id] || 0) + val;
          rendaAluguerTotal += val;
        } else {
          adhocByMotorista[m.motorista_id] = (adhocByMotorista[m.motorista_id] || 0) + val;
        }
      });

      setRendaAluguerSemana(rendaAluguerTotal);

      // Mapa de viagens reais da atividade Uber (por uber_driver_id)
      const uberViagensByDriver: Record<string, number> = {};
      (atividadeResult.data || []).forEach((a) => {
        if (a.uber_driver_id) {
          uberViagensByDriver[a.uber_driver_id] =
            (uberViagensByDriver[a.uber_driver_id] || 0) + (a.viagens_concluidas || 0);
        }
      });

      // Mapa uber_driver_id → motorista_id (via uber_drivers table)
      const uberDriverToMotoristaMap: Record<string, string> = {};
      const uberDriverNameMap: Record<string, string> = {};
      (uberDriversResult.data || []).forEach((d) => {
        if (d.uber_driver_id) {
          if (d.motorista_id) uberDriverToMotoristaMap[d.uber_driver_id] = d.motorista_id;
          if (d.full_name) uberDriverNameMap[d.uber_driver_id] = d.full_name;
        }
      });

      // 5. Agrupar por motorista_id (chave unificadora)
      interface AgrupadoEntry {
        motorista_id: string | null;
        driver_name: string;
        driver_uuid: string;
        faturado_bolt: number;
        faturado_uber: number;
        viagens_bolt: number;
        viagens_uber: number;
        identificador_bolt?: string;
      }
      const agrupado: Record<string, AgrupadoEntry> = {};

      // 5a. Processar Bolt
      (boltResult.data || []).forEach((v) => {
        const driverUuid = v.driver_uuid || 'unknown';
        const identificadorBolt = (v as any).raw_data?.['Identificador do motorista'] || '';

        // ORDEM DE MATCHING BOLT:
        // 1. Pelo bolt_id gravado na ficha do motorista (CRM)
        // 2. Pelo mapeamento histórico da tabela bolt_drivers
        // 3. Pelo match inteligente de nomes
        let motoristaId =
          identificadorBolt && boltIdMap[identificadorBolt]
            ? boltIdMap[identificadorBolt]
            : boltToMotoristaMap[driverUuid] || null;

        let displayName = v.driver_name || 'Desconhecido';

        // Se não tem mapeamento directo, tentar match inteligente
        if (!motoristaId && displayName !== 'Desconhecido') {
          for (const [normName, mData] of Object.entries(nomeToMotoristaMap)) {
            if (isNameMatch(displayName, mData.nome)) {
              motoristaId = mData.id;
              displayName = mData.nome;
              reciboVerdeMap[mData.id] = mData.recibo_verde;
              break;
            }
          }
        } else if (motoristaId) {
          displayName = motoristaNameMap[motoristaId] || displayName;
        }

        const key = motoristaId || `bolt_${driverUuid}`;

        if (!agrupado[key]) {
          agrupado[key] = {
            motorista_id: motoristaId,
            driver_name: displayName,
            driver_uuid: driverUuid,
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
        agrupado[key].faturado_bolt += Number(v.driver_earnings) || 0;
        agrupado[key].viagens_bolt += 1;
        if (identificadorBolt) agrupado[key].identificador_bolt = identificadorBolt;
      });

      // 5a-bis. Processar resumos semanais Bolt (CSV) — complementar dados da API
      const boltResumosTracked = new Set<string>();
      Object.entries(agrupado).forEach(([key, entry]) => {
        if (entry.faturado_bolt > 0) boltResumosTracked.add(key);
      });

      (boltResumosResult.data || []).forEach((r: any) => {
        let motoristaId: string | null = r.motorista_id || null;
        const identificadorBolt = r.identificador_motorista || '';

        // Tentar match por ID se não veio no registo
        if (!motoristaId && identificadorBolt && boltIdMap[identificadorBolt]) {
          motoristaId = boltIdMap[identificadorBolt];
        }

        let displayName = r.motorista_nome || 'Desconhecido';

        if (!motoristaId && displayName !== 'Desconhecido') {
          for (const [normName, mData] of Object.entries(nomeToMotoristaMap)) {
            if (isNameMatch(displayName, mData.nome)) {
              motoristaId = mData.id;
              displayName = mData.nome;
              reciboVerdeMap[mData.id] = mData.recibo_verde;
              break;
            }
          }
        }

        const key = motoristaId || `bolt_csv_${r.identificador_motorista || displayName}`;

        // Se já temos dados da API (bolt_viagens) para este motorista, ignorar CSV
        if (boltResumosTracked.has(key)) return;

        if (!agrupado[key]) {
          agrupado[key] = {
            motorista_id: motoristaId,
            driver_name: displayName,
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
        agrupado[key].faturado_bolt += Number(r.ganhos_liquidos) || 0;
        agrupado[key].viagens_bolt += Number(r.viagens_terminadas) || 0;
        if (identificadorBolt && !agrupado[key].identificador_bolt) {
          agrupado[key].identificador_bolt = identificadorBolt;
        }
      });

      // 5b. Processar Uber — aggregate by uber_driver_id
      const uberByDriver: Record<
        string,
        { firstName: string; lastName: string; total: number; count: number }
      > = {};
      (uberResult.data || []).forEach((t) => {
        const driverId = t.uber_driver_id || 'unknown';
        if (!uberByDriver[driverId]) {
          const csvRow = (t.raw_transaction as any)?.csv_row || {};
          uberByDriver[driverId] = {
            firstName: csvRow['Nome próprio do motorista'] || '',
            lastName: csvRow['Apelido do motorista'] || '',
            total: 0,
            count: 0,
          };
        }
        uberByDriver[driverId].total += Number(t.gross_amount) || 0;
        uberByDriver[driverId].count = uberViagensByDriver[driverId] || 0;
      });

      // Also inject drivers that only have atividade but no payment transactions
      for (const [driverId, viagens] of Object.entries(uberViagensByDriver)) {
        if (!uberByDriver[driverId]) {
          uberByDriver[driverId] = {
            firstName: uberDriverNameMap[driverId]?.split(' ')[0] || '',
            lastName: uberDriverNameMap[driverId]?.split(' ').slice(1).join(' ') || '',
            total: 0,
            count: viagens,
          };
        }
      }

      // Match each Uber driver with motorista_id
      Object.entries(uberByDriver).forEach(([uberDriverId, uberData]) => {
        const uberFullName = `${uberData.firstName} ${uberData.lastName}`.trim();

        // ORDEM DE MATCHING UBER:
        // 1. Pelo uber_uuid gravado na ficha do motorista (CRM)
        // 2. Pelo mapeamento histórico da tabela uber_drivers.motorista_id
        // 3. Pelo match inteligente de nomes
        let matchedMotoristaId: string | null =
          uberIdMap[uberDriverId] || uberDriverToMotoristaMap[uberDriverId] || null;
        let matchedName = uberFullName || uberDriverNameMap[uberDriverId] || uberDriverId;

        if (matchedMotoristaId) {
          // Use name from motoristas_ativos if available
          const motData = Object.values(nomeToMotoristaMap).find(
            (m) => m.id === matchedMotoristaId
          );
          if (motData) {
            matchedName = motData.nome;
            reciboVerdeMap[motData.id] = motData.recibo_verde;
          }
        } else {
          // Priority 3: smart match
          for (const [normName, mData] of Object.entries(nomeToMotoristaMap)) {
            if (isNameMatch(matchedName, mData.nome)) {
              matchedMotoristaId = mData.id;
              matchedName = mData.nome;
              reciboVerdeMap[mData.id] = mData.recibo_verde;
              break;
            }
          }
        }

        const key = matchedMotoristaId || `uber_${uberDriverId}`;

        if (agrupado[key]) {
          // Já existe (provavelmente do Bolt) — adicionar Uber
          agrupado[key].faturado_uber += uberData.total;
          agrupado[key].viagens_uber += uberData.count;
        } else {
          agrupado[key] = {
            motorista_id: matchedMotoristaId,
            driver_name: matchedName,
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: uberData.total,
            viagens_bolt: 0,
            viagens_uber: uberData.count,
          };
        }
      });

      // 5b-bis. Ensure drivers with ONLY fuel/reparacoes are added to agrupado
      for (const [motoristaId, totalFuel] of Object.entries(combustivelByMotorista)) {
        if (!agrupado[motoristaId] && totalFuel > 0) {
          const motData = Object.values(nomeToMotoristaMap).find((m) => m.id === motoristaId);
          agrupado[motoristaId] = {
            motorista_id: motoristaId,
            driver_name: motData?.nome || 'Desconhecido',
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
      }

      for (const [motoristaId, totalRep] of Object.entries(reparacoesByMotorista)) {
        if (!agrupado[motoristaId] && totalRep > 0) {
          const motData = Object.values(nomeToMotoristaMap).find((m) => m.id === motoristaId);
          agrupado[motoristaId] = {
            motorista_id: motoristaId,
            driver_name: motData?.nome || 'Desconhecido',
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
      }

      for (const [motoristaId, totalAdhoc] of Object.entries(adhocByMotorista)) {
        if (!agrupado[motoristaId] && totalAdhoc > 0) {
          const motData = Object.values(nomeToMotoristaMap).find((m) => m.id === motoristaId);
          agrupado[motoristaId] = {
            motorista_id: motoristaId,
            driver_name: motData?.nome || 'Desconhecido',
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
      }

      // 5c. Dedup final
      const fundir = (alvoKey: string, dupKey: string) => {
        if (alvoKey === dupKey) return;
        const dup = agrupado[dupKey];
        if (!dup || !agrupado[alvoKey]) return;
        agrupado[alvoKey].faturado_bolt += dup.faturado_bolt;
        agrupado[alvoKey].faturado_uber += dup.faturado_uber;
        agrupado[alvoKey].viagens_bolt += dup.viagens_bolt;
        agrupado[alvoKey].viagens_uber += dup.viagens_uber;
        if (!agrupado[alvoKey].motorista_id && dup.motorista_id) {
          agrupado[alvoKey].motorista_id = dup.motorista_id;
        }
        if (!agrupado[alvoKey].identificador_bolt && dup.identificador_bolt) {
          agrupado[alvoKey].identificador_bolt = dup.identificador_bolt;
        }
        delete agrupado[dupKey];
      };

      // (1) Fusão por motorista_id
      const idDedupMap: Record<string, string[]> = {};
      for (const [key, entry] of Object.entries(agrupado)) {
        if (entry.motorista_id) {
          (idDedupMap[entry.motorista_id] ||= []).push(key);
        }
      }
      for (const keys of Object.values(idDedupMap)) {
        if (keys.length <= 1) continue;
        const primaryKey =
          keys.find((k) => !k.startsWith('bolt_') && !k.startsWith('uber_')) || keys[0];
        keys.forEach((k) => fundir(primaryKey, k));
      }

      // (2) Fusão FINAL por nome normalizado COMPLETO — abrange TODAS as entradas
      // (com e sem motorista_id). Garante que o mesmo nome nunca dá 2 linhas.
      // Segurança: não funde duas entradas com motorista_id DIFERENTE (homónimos reais).
      const nameDedupMap: Record<string, string[]> = {};
      for (const [key, entry] of Object.entries(agrupado)) {
        const nomeCanon =
          (entry.motorista_id && crmNomeById[entry.motorista_id]) || entry.driver_name;
        const norm = normalizeName(nomeCanon);
        if (norm) (nameDedupMap[norm] ||= []).push(key);
      }
      for (const keys of Object.values(nameDedupMap)) {
        if (keys.length <= 1) continue;
        // Primária: preferir uma com motorista_id (e key "real", não bolt_/uber_)
        const comId = keys.filter((k) => agrupado[k]?.motorista_id);
        const idsDistintos = new Set(comId.map((k) => agrupado[k]!.motorista_id));
        if (idsDistintos.size > 1) {
          // Homónimos reais (motorista_ids diferentes) — não fundir entre si.
          // Mas ainda podemos agregar os SEM id ao primeiro com id.
          const primaria = comId[0];
          keys.filter((k) => !agrupado[k]?.motorista_id).forEach((k) => fundir(primaria, k));
          continue;
        }
        const primaryKey =
          comId.find((k) => !k.startsWith('bolt_') && !k.startsWith('uber_')) ||
          comId[0] ||
          keys[0];
        keys.forEach((k) => fundir(primaryKey, k));
      }

      const resumosCalculados = Object.values(agrupado).map((m) => {
        // Nome canónico: se há motorista_id mapeado, usar SEMPRE o nome do CRM
        // (evita mostrar "Roberto Guilherme Neto" da plataforma quando o CRM diz "Roberto Rocha").
        const displayNameFinal = (m.motorista_id && crmNomeById[m.motorista_id]) || m.driver_name;
        const extrasValor = m.motorista_id ? extrasByMotorista[m.motorista_id] || 0 : 0;
        const totalFaturado = m.faturado_bolt + m.faturado_uber + extrasValor;
        const totalViagens = m.viagens_bolt + m.viagens_uber;
        const passaReciboVerde = m.motorista_id ? (reciboVerdeMap[m.motorista_id] ?? true) : true;

        const receita = passaReciboVerde
          ? totalFaturado
          : (m.faturado_bolt + m.faturado_uber) / 1.06 + extrasValor;
        const combustivelValor = m.motorista_id ? combustivelByMotorista[m.motorista_id] || 0 : 0;
        const portagensValor = m.motorista_id ? portagensByMotorista[m.motorista_id] || 0 : 0;
        const aluguerValor = m.motorista_id ? aluguerByMotorista[m.motorista_id] || 0 : 0;
        const reparacoesValor = m.motorista_id ? reparacoesByMotorista[m.motorista_id] || 0 : 0;
        const adhocValor = m.motorista_id ? adhocByMotorista[m.motorista_id] || 0 : 0;
        const liquido =
          receita - combustivelValor - portagensValor - aluguerValor - reparacoesValor - adhocValor;

        return {
          driver_name: displayNameFinal,
          driver_uuid: m.driver_uuid,
          motorista_id: m.motorista_id || undefined,
          total_faturado: totalFaturado,
          faturado_bolt: m.faturado_bolt,
          faturado_uber: m.faturado_uber,
          total_viagens: totalViagens,
          viagens_bolt: m.viagens_bolt,
          viagens_uber: m.viagens_uber,
          recibo_verde: passaReciboVerde,
          liquido,
          combustivel: combustivelValor,
          portagens: portagensValor,
          reparacoes: reparacoesValor,
          outros_custos: adhocValor,
          aluguer: aluguerValor,
          identificador_bolt: m.identificador_bolt,
        };
      });

      resumosCalculados.sort((a, b) => b.total_faturado - a.total_faturado);
      // Atribuir _uid único e estável por linha (usado em selectedIds e React keys).
      const comUid: MotoristaResumo[] = resumosCalculados.map((r, idx) => ({
        ...r,
        _uid: r.motorista_id || r.driver_uuid || `${r.driver_name || 'sem-nome'}__${idx}`,
      }));
      setResumos(comUid);
    } catch (error) {
      console.error('Erro ao carregar resumos:', error);
      toast.error('Erro ao carregar dados de contas');
    } finally {
      setLoading(false);
    }
  }

  const isCompanyName = (name: string) =>
    /\b(lda\.?|ldª|s\.?a\.?|sarl|unipessoal|unip\.?|sociedade|cooperativa|associa[cç][aã]o)\b|,\s*lda/i.test(
      name
    );

  // Filtrar + ordenar
  const filteredResumos = useMemo(() => {
    let result = resumos.filter((r) => {
      if (isCompanyName(r.driver_name)) return false;
      // Excluir inativos (motoristas com status_ativo = false no CRM)
      if (r.motorista_id && statusAtivoMap[r.motorista_id] === false) return false;
      if (searchTerm && !matchesSearch(r.driver_name, searchTerm)) return false;
      if (filterRecibo === 'verde' && !r.recibo_verde) return false;
      if (filterRecibo === 'nao_verde' && r.recibo_verde) return false;
      if (filterSaldo === 'negativos') {
        if (r.liquido >= 0) return false;
        // Sem receitas = novo ou sem viagens esta semana, não é um "negativo real"
        if (r.total_faturado === 0) return false;
        // Entrou esta semana = ainda não tem semana completa
        if (r.motorista_id && dataContratacaoMap[r.motorista_id]) {
          const dc = new Date(dataContratacaoMap[r.motorista_id]);
          if (dc >= weekStart && dc <= weekEnd) return false;
        }
      }
      if (filterSaldo === 'positivos' && r.liquido < 0) return false;
      if (filterGestor !== 'todos') {
        const gestor = r.motorista_id ? gestorMap[r.motorista_id] || '' : '';
        if (gestor !== filterGestor) return false;
      }
      return true;
    });
    result = [...result].sort((a, b) => {
      const av = sortField === 'driver_name' ? a.driver_name : ((a[sortField] as number) ?? 0);
      const bv = sortField === 'driver_name' ? b.driver_name : ((b[sortField] as number) ?? 0);
      if (typeof av === 'string')
        return sortDir === 'asc'
          ? av.localeCompare(bv as string)
          : (bv as string).localeCompare(av);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return result;
  }, [
    resumos,
    searchTerm,
    filterRecibo,
    filterSaldo,
    filterGestor,
    gestorMap,
    dataContratacaoMap,
    statusAtivoMap,
    weekStart,
    weekEnd,
    sortField,
    sortDir,
  ]);

  // Totais gerais
  const totais = useMemo(() => {
    return filteredResumos.reduce(
      (acc, r) => ({
        faturado: acc.faturado + r.total_faturado,
        liquido: acc.liquido + r.liquido,
        aluguer: acc.aluguer + r.aluguer,
      }),
      { faturado: 0, liquido: 0, aluguer: 0 }
    );
  }, [filteredResumos]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  if (loading && resumos.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handlePrintAll = async () => {
    const list = filteredResumos;
    if (list.length === 0) return;
    setShowPrintSettings(false);
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
    const fmtEur = (v: number) =>
      new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
    const periodoLabel = `${format(weekStart, 'dd/MM/yyyy', { locale: pt })} — ${format(weekEnd, 'dd/MM/yyyy', { locale: pt })}`;
    const date = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: pt });
    const totalFaturado = list.reduce((s, r) => s + r.total_faturado, 0);
    const totalLiquido = list.reduce((s, r) => s + r.liquido, 0);
    const totalAluguer = list.reduce((s, r) => s + r.aluguer, 0);
    const totalCombust = list.reduce((s, r) => s + r.combustivel, 0);
    const orientation = printSettings.orientacao === 'landscape' ? 'landscape' : 'portrait';

    const extraCols = [
      printSettings.mostrarMatricula ? '<th>Matrícula</th>' : '',
      printSettings.mostrarGestor ? '<th>Gestor</th>' : '',
    ].join('');

    const rows = list
      .map((r) => {
        const extraTds = [
          printSettings.mostrarMatricula
            ? `<td>${r.motorista_id ? matriculaMap[r.motorista_id] || '—' : '—'}</td>`
            : '',
          printSettings.mostrarGestor
            ? `<td>${r.motorista_id ? gestorMap[r.motorista_id] || '—' : '—'}</td>`
            : '',
        ].join('');
        const liquidoColor = r.liquido < 0 ? '#dc2626' : '#15803d';
        return `<tr>
        <td style="font-weight:500">${r.driver_name}</td>
        <td style="text-align:right">${fmtEur(r.total_faturado)}</td>
        <td style="text-align:right;color:#16a34a">${fmtEur(r.combustivel)}</td>
        <td style="text-align:right;color:#16a34a">${fmtEur(r.portagens)}</td>
        <td style="text-align:right;color:#16a34a">${fmtEur(r.reparacoes)}</td>
        <td style="text-align:right;color:#16a34a">${fmtEur(r.outros_custos)}</td>
        <td style="text-align:right;color:#16a34a">${fmtEur(r.aluguer)}</td>
        ${extraTds}
        <td style="text-align:right;font-weight:700;color:${liquidoColor}">${fmtEur(r.liquido)}</td>
      </tr>`;
      })
      .join('');

    const footerExtras = [
      printSettings.mostrarMatricula ? '<td></td>' : '',
      printSettings.mostrarGestor ? '<td></td>' : '',
    ].join('');

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Resumos Semanais — WeGest</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a1a;background:white}
      .page{padding:24px 32px}
      .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:2px solid #e5e7eb;margin-bottom:20px}
      .header-left{display:flex;align-items:center;gap:16px}
      .header-logo{height:48px;width:auto}
      .header-title h1{font-size:18px;font-weight:700;color:#111827}
      .header-title p{font-size:11px;color:#6b7280;margin-top:2px}
      .header-right{text-align:right;font-size:10px;color:#6b7280;line-height:1.8}
      .stats{display:flex;gap:10px;margin-bottom:20px}
      .stat{border-radius:8px;padding:10px 16px;min-width:90px;color:#fff}
      .stat .lbl{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.85}
      .stat .val{font-size:15px;font-weight:700;margin-top:2px}
      table{width:100%;border-collapse:collapse}
      thead th{background:#f1f5f9;border-bottom:2px solid #cbd5e1;padding:7px 9px;text-align:left;font-weight:600;color:#374151;font-size:9px;text-transform:uppercase;letter-spacing:.05em}
      thead th.r{text-align:right}
      tbody td{border-bottom:1px solid #f1f5f9;padding:6px 9px;font-size:11px}
      tbody tr:nth-child(even) td{background:#f8fafc}
      tfoot td{border-top:2px solid #cbd5e1;padding:7px 9px;font-weight:700}
      tfoot td.r{text-align:right}
      .footer{margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#9ca3af}
      @page{size:${orientation};margin:10mm}
    </style></head><body onload="window.print()">
    <div class="page">
      <div class="header">
        <div class="header-left">
          <img src="${logoUrl}" alt="WeGest" class="header-logo"/>
          <div class="header-title"><h1>Resumos Semanais</h1><p>${periodoLabel}</p></div>
        </div>
        <div class="header-right"><div>Exportado em ${date}</div><div>${list.length} motorista(s)</div></div>
      </div>
      <div class="stats">
        <div class="stat" style="background:#6366f1"><div class="lbl">Motoristas</div><div class="val">${list.length}</div></div>
        <div class="stat" style="background:#22c55e"><div class="lbl">Total Faturado</div><div class="val">${fmtEur(totalFaturado)}</div></div>
        <div class="stat" style="background:${totalLiquido >= 0 ? '#2563eb' : '#ef4444'}"><div class="lbl">Líquido</div><div class="val">${fmtEur(totalLiquido)}</div></div>
        <div class="stat" style="background:#8b5cf6"><div class="lbl">Aluguer</div><div class="val">${fmtEur(totalAluguer)}</div></div>
        <div class="stat" style="background:#f59e0b"><div class="lbl">Combustível</div><div class="val">${fmtEur(totalCombust)}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Motorista</th>
          <th class="r">Faturado</th><th class="r">Combustível</th>
          <th class="r">Portagens</th><th class="r">Reparações</th><th class="r">Outros</th>
          <th class="r">Aluguer</th>${extraCols}<th class="r">Líquido</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td>Total</td>
          <td class="r">${fmtEur(totalFaturado)}</td>
          <td class="r">${fmtEur(totalCombust)}</td>
          <td class="r">${fmtEur(list.reduce((s, r) => s + r.portagens, 0))}</td>
          <td class="r">${fmtEur(list.reduce((s, r) => s + r.reparacoes, 0))}</td>
          <td class="r">${fmtEur(list.reduce((s, r) => s + r.outros_custos, 0))}</td>
          <td class="r">${fmtEur(totalAluguer)}</td>
          ${footerExtras}
          <td class="r">${fmtEur(totalLiquido)}</td>
        </tr></tfoot>
      </table>
      <div class="footer"><span>WeGest — Sistema de Gestão de Frotas</span><span>${date}</span></div>
    </div></body></html>`);
    w.document.close();
  };

  const handleExportAll = () => {
    const fmtEur = (v: number) => Number(v.toFixed(2));
    const rows = filteredResumos.map((r) => ({
      Motorista: r.driver_name,
      'Faturado (€)': fmtEur(r.total_faturado),
      'Combustível (€)': fmtEur(r.combustivel),
      'Portagens (€)': fmtEur(r.portagens),
      'Reparações (€)': fmtEur(r.reparacoes),
      'Outros (€)': fmtEur(r.outros_custos),
      'Aluguer (€)': fmtEur(r.aluguer),
      'Líquido (€)': fmtEur(r.liquido),
      'Recibo Verde': r.recibo_verde ? 'Sim' : 'Não',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resumos');
    XLSX.writeFile(wb, `resumos_${format(weekStart, 'yyyyMMdd')}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3">
        {/* Seletor de Semana */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Navegação de Semana */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="justify-center text-center font-normal min-w-[260px]"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {getWeekLabel()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                {/* Atalhos de Semanas */}
                <div className="p-3 border-b">
                  <div className="flex flex-wrap gap-1.5">
                    {weekShortcuts.map((shortcut) => (
                      <Button
                        key={shortcut.label}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setSelectedWeek(shortcut.date)}
                      >
                        {shortcut.label}
                      </Button>
                    ))}
                  </div>
                </div>
                {/* Calendário - seleciona semana inteira */}
                <CalendarComponent
                  initialFocus
                  mode="single"
                  defaultMonth={selectedWeek}
                  selected={selectedWeek}
                  onSelect={handleDayClick}
                  numberOfMonths={isMobile ? 1 : 2}
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
            <Button variant="outline" size="icon" onClick={goToNextWeek} disabled={isCurrentWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar motorista..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2 sm:ml-auto flex-shrink-0">
            <div className="relative">
              <div className="flex">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrintAll}
                  className="rounded-r-none border-r-0"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-l-none px-2"
                  onClick={() => setShowPrintSettings((v) => !v)}
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </div>
              {showPrintSettings && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border rounded-lg shadow-lg p-4 w-64 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Opções de impressão
                  </p>
                  <div className="space-y-2">
                    {[
                      { key: 'mostrarGestor', label: 'Gestor Responsável' },
                      { key: 'mostrarMatricula', label: 'Matrícula' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <Switch
                          id={`ps-${key}`}
                          checked={printSettings[key]}
                          onCheckedChange={(v) => updatePrintSetting(key, v)}
                        />
                        <Label htmlFor={`ps-${key}`} className="text-sm cursor-pointer">
                          {label}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1 pt-1">
                    {(['portrait', 'landscape'] as const).map((o) => (
                      <Button
                        key={o}
                        size="sm"
                        variant={printSettings.orientacao === o ? 'default' : 'outline'}
                        className="flex-1 text-xs h-7"
                        onClick={() => updatePrintSetting('orientacao', o)}
                      >
                        {o === 'portrait' ? 'Vertical' : 'Horizontal'}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleExportAll}>
              <FileDown className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
            <Button
              className="gap-2 bg-gradient-to-r from-primary to-primary/80 text-white hover:opacity-90"
              onClick={() => setImportarWizardOpen(true)}
            >
              <Upload className="h-4 w-4" />
              Importar Dados
            </Button>
          </div>
        </div>

        {/* Pills de filtro */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium mr-1">Filtrar:</span>
          <button
            onClick={() => setFilterRecibo(filterRecibo === 'verde' ? 'todos' : 'verde')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              filterRecibo === 'verde'
                ? 'bg-green-500 border-green-500 text-white'
                : 'border-border text-muted-foreground hover:border-green-500 hover:text-green-600'
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            Recibo Verde
          </button>
          <button
            onClick={() => setFilterRecibo(filterRecibo === 'nao_verde' ? 'todos' : 'nao_verde')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              filterRecibo === 'nao_verde'
                ? 'bg-orange-500 border-orange-500 text-white'
                : 'border-border text-muted-foreground hover:border-orange-500 hover:text-orange-500'
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            Sem Recibo Verde
          </button>
          <button
            onClick={() => setFilterSaldo(filterSaldo === 'negativos' ? 'todos' : 'negativos')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              filterSaldo === 'negativos'
                ? 'bg-red-500 border-red-500 text-white'
                : 'border-border text-muted-foreground hover:border-red-500 hover:text-red-500'
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            Líquido Negativo
          </button>
          {/* Filtro por gestor */}
          {Object.keys(gestorMap).length > 0 && (
            <Select value={filterGestor} onValueChange={setFilterGestor}>
              <SelectTrigger className="h-7 text-xs w-auto min-w-[140px] border-border">
                <SelectValue placeholder="Gestor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os gestores</SelectItem>
                {[...new Set(Object.values(gestorMap))].sort().map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(filterRecibo !== 'todos' || filterSaldo !== 'todos' || filterGestor !== 'todos') && (
            <button
              onClick={() => {
                setFilterRecibo('todos');
                setFilterSaldo('todos');
                setFilterGestor('todos');
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Motoristas</div>
            <div className="text-xl font-bold flex items-center gap-1">
              <Users className="h-4 w-4 text-primary" />
              {filteredResumos.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Renda Total Aluguer</div>
            <div className="text-xl font-bold text-purple-600">
              {formatCurrency(totais.aluguer)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Total Faturado</div>
            <div className="text-xl font-bold text-green-600">
              {formatCurrency(totais.faturado)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Líquido</div>
            <div className="text-xl font-bold flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-primary" />
              {formatCurrency(totais.liquido)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="text-green-600 font-bold">●</span> Passa recibo verde (valor integral)
        </div>
        <div className="flex items-center gap-1">
          <span className="text-orange-500 font-bold">●</span> Não passa recibo verde (valor ÷ 1.06)
        </div>
        <div className="flex items-center gap-1">
          <span className="text-red-500 font-bold">●</span> Líquido negativo
        </div>
      </div>

      {/* Contador */}
      <div className="text-sm text-muted-foreground">
        {filteredResumos.length} motorista{filteredResumos.length !== 1 && 's'} no período
      </div>

      {/* Sortable header helper */}
      {(() => {
        const SortTh = ({
          field,
          children,
          right,
        }: {
          field: SortField;
          children: React.ReactNode;
          right?: boolean;
        }) => {
          const Icon = sortField !== field ? ArrowUpDown : sortDir === 'desc' ? ArrowDown : ArrowUp;
          return (
            <TableHead
              className={cn(
                'cursor-pointer select-none hover:bg-muted/50 transition-colors',
                right && 'text-right'
              )}
              onClick={() => handleSort(field)}
            >
              <span className={cn('inline-flex items-center gap-1', right && 'justify-end w-full')}>
                {children}
                <Icon
                  className={cn(
                    'h-3 w-3',
                    sortField === field ? 'text-primary' : 'text-muted-foreground/50'
                  )}
                />
              </span>
            </TableHead>
          );
        };

        return (
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={
                        selectedIds.size === filteredResumos.length && filteredResumos.length > 0
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <SortTh field="driver_name">Nome</SortTh>
                  <SortTh field="total_faturado" right>
                    Faturado
                  </SortTh>
                  <SortTh field="liquido" right>
                    Líquido
                  </SortTh>
                  <SortTh field="aluguer" right>
                    Aluguer
                  </SortTh>
                  <SortTh field="combustivel" right>
                    Combustível
                  </SortTh>
                  <SortTh field="portagens" right>
                    Portagens
                  </SortTh>
                  <SortTh field="outros_custos" right>
                    Outros Custos
                  </SortTh>
                  <SortTh field="reparacoes" right>
                    Reparações
                  </SortTh>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResumos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhum dado encontrado para o período selecionado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredResumos.map((resumo, idx) => {
                    const rowId = resumo._uid || `row-${idx}`;
                    return (
                      <TableRow
                        key={rowId}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-muted/50',
                          resumo.liquido < 0 && '[box-shadow:inset_4px_0_0_0_#ef4444]'
                        )}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(rowId)}
                            onCheckedChange={() => toggleSelectOne(rowId)}
                          />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'font-bold',
                            resumo.recibo_verde ? 'text-green-600' : 'text-orange-500'
                          )}
                          onClick={() => handleRowClick(resumo)}
                        >
                          {resumo.driver_name}
                        </TableCell>
                        <TableCell className="text-right" onClick={() => handleRowClick(resumo)}>
                          <span className="text-green-600 font-medium">
                            {formatCurrency(resumo.total_faturado)}
                          </span>
                          {resumo.faturado_bolt > 0 && resumo.faturado_uber > 0 && (
                            <div className="text-xs text-muted-foreground">
                              B: {formatCurrency(resumo.faturado_bolt)} | U:{' '}
                              {formatCurrency(resumo.faturado_uber)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-bold',
                            resumo.liquido < 0 && 'text-red-500'
                          )}
                          onClick={() => handleRowClick(resumo)}
                        >
                          {formatCurrency(resumo.liquido)}
                        </TableCell>
                        <TableCell className="text-right" onClick={() => handleRowClick(resumo)}>
                          {resumo.aluguer > 0 ? (
                            <span className="font-medium text-green-600">
                              {formatCurrency(resumo.aluguer)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">€0,00</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={() => handleRowClick(resumo)}>
                          {resumo.combustivel > 0 ? (
                            <span className="font-medium text-green-600">
                              {formatCurrency(resumo.combustivel)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">€0,00</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={() => handleRowClick(resumo)}>
                          {resumo.portagens > 0 ? (
                            <span className="font-medium text-green-600">
                              {formatCurrency(resumo.portagens)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">€0,00</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={() => handleRowClick(resumo)}>
                          {resumo.outros_custos > 0 ? (
                            <span className="font-medium text-green-600">
                              {formatCurrency(resumo.outros_custos)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">€0,00</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={() => handleRowClick(resumo)}>
                          {resumo.reparacoes > 0 ? (
                            <span className="font-medium text-green-600">
                              {formatCurrency(resumo.reparacoes)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">€0,00</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        );
      })()}

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {filteredResumos.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum dado encontrado para o período selecionado
            </CardContent>
          </Card>
        ) : (
          filteredResumos.map((resumo, idx) => {
            const rowId = resumo._uid || `row-${idx}`;
            return (
              <Card
                key={rowId}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-muted/50',
                  resumo.liquido < 0 && 'border-l-4 border-l-red-500'
                )}
              >
                <CardContent className="pt-4 pb-3 space-y-3">
                  {/* Header */}
                  <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(rowId)}
                          onCheckedChange={() => toggleSelectOne(rowId)}
                        />
                      </div>
                      <div onClick={() => handleRowClick(resumo)}>
                        <div
                          className={cn(
                            'font-bold',
                            resumo.recibo_verde ? 'text-green-600' : 'text-orange-500'
                          )}
                        >
                          {resumo.driver_name}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Financeiro */}
                  <div
                    className="space-y-1.5 text-sm border-t pt-3"
                    onClick={() => handleRowClick(resumo)}
                  >
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Faturado</span>
                      <span className="font-medium text-green-600">
                        {formatCurrency(resumo.total_faturado)}
                      </span>
                    </div>
                    {resumo.faturado_bolt > 0 && resumo.faturado_uber > 0 && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Bolt: {formatCurrency(resumo.faturado_bolt)}</span>
                        <span>Uber: {formatCurrency(resumo.faturado_uber)}</span>
                      </div>
                    )}
                  </div>

                  {/* Líquido */}
                  <div
                    className="flex justify-between border-t pt-3"
                    onClick={() => handleRowClick(resumo)}
                  >
                    <span className="font-semibold">Líquido</span>
                    <span
                      className={cn(
                        'font-bold',
                        resumo.liquido < 0 ? 'text-red-500' : 'text-primary'
                      )}
                    >
                      {formatCurrency(resumo.liquido)}
                    </span>
                  </div>

                  {/* Despesas */}
                  <div
                    className="space-y-1.5 text-sm border-t pt-3"
                    onClick={() => handleRowClick(resumo)}
                  >
                    {resumo.aluguer > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Aluguer</span>
                        <span className="text-purple-600">-{formatCurrency(resumo.aluguer)}</span>
                      </div>
                    )}
                    {resumo.combustivel > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Combustível</span>
                        <span className="text-orange-600">
                          -{formatCurrency(resumo.combustivel)}
                        </span>
                      </div>
                    )}
                    {resumo.portagens > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Portagens</span>
                        <span className="text-green-700">-{formatCurrency(resumo.portagens)}</span>
                      </div>
                    )}
                    {resumo.outros_custos > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Outros Custos</span>
                        <span className="text-destructive">
                          -{formatCurrency(resumo.outros_custos)}
                        </span>
                      </div>
                    )}
                    {resumo.reparacoes > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reparações</span>
                        <span className="text-red-600">-{formatCurrency(resumo.reparacoes)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Floating Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="text-sm font-medium">
            {selectedIds.size} selecionado{selectedIds.size !== 1 && 's'}
          </div>
          <div className="h-4 w-[1px] bg-border" />
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <Printer className="h-4 w-4" />
                  Imprimir
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-72">
                <DropdownMenuItem
                  className="cursor-pointer gap-3 py-2.5"
                  onClick={() => handleBulkPrintConsolidado()}
                >
                  <FileText className="h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-medium">Relatório consolidado</span>
                    <span className="text-xs text-muted-foreground">
                      Tabela com todos os motoristas selecionados
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-3 py-2.5"
                  onClick={() => handleBulkPrint()}
                >
                  <Files className="h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-medium">Relatórios individuais</span>
                    <span className="text-xs text-muted-foreground">
                      1 página por motorista (PDF combinado)
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              className="h-9 gap-2 rounded-full"
              disabled={isBulkSending}
              onClick={() => handleBulkEmail()}
            >
              {isBulkSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar por Email
            </Button>
          </div>
          <div className="h-4 w-[1px] bg-border" />
          <Button
            size="sm"
            variant="ghost"
            className="h-9 px-3 rounded-full hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setSelectedIds(new Set())}
          >
            Limpar
          </Button>
        </div>
      )}

      {/* Dialog de Resumo Detalhado */}
      <MotoristaResumoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        motorista={selectedMotorista}
        dateRange={{ from: weekStart, to: weekEnd }}
      />

      {/* Wizard de Importação de Dados das Plataformas */}
      <ImportarDadosWizard
        open={importarWizardOpen}
        onOpenChange={setImportarWizardOpen}
        onImportComplete={() => loadResumos()}
      />
    </div>
  );
}
