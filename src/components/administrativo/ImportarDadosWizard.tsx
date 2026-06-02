import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, isThisWeek } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Car,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Fuel,
  Loader2,
  Upload,
  Zap,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const WEEK_STARTS_ON = 1 as const;

type Plataforma = 'bolt' | 'uber' | 'bp' | 'repsol' | 'edp' | 'viaverde';

interface PlataformaConfig {
  value: Plataforma;
  label: string;
  icon: LucideIcon;
  /** Caminho da logo PNG (fallback para o ícone se não existir). */
  logo: string;
  /** Tailwind colour token usado como cor primária do passo/cartão. */
  accent: string;
  /** Tom de fundo do cartão (selecionado). */
  bg: string;
  /** Borda quando selecionado. */
  border: string;
  /** Texto do ícone. */
  text: string;
  desc: string;
}

const PLATAFORMAS: PlataformaConfig[] = [
  {
    value: 'bolt',
    label: 'Bolt',
    icon: Zap,
    logo: '/images/logo-bolt.png',
    accent: 'bg-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    desc: 'Settlement semanal (Motorista · Ganhos líquidos)',
  },
  {
    value: 'uber',
    label: 'Uber',
    icon: Car,
    logo: '/images/logo-uber.png',
    accent: 'bg-slate-900 dark:bg-slate-200',
    bg: 'bg-slate-500/10',
    border: 'border-slate-700 dark:border-slate-300',
    text: 'text-slate-700 dark:text-slate-200',
    desc: 'Pagamentos semanais (UUID · Nome · Pago a Si)',
  },
  {
    value: 'bp',
    label: 'BP',
    icon: Fuel,
    logo: '/images/logo-bp.png',
    accent: 'bg-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500',
    text: 'text-orange-600 dark:text-orange-400',
    desc: 'CardMonitor — transações de combustível',
  },
  {
    value: 'repsol',
    label: 'Repsol',
    icon: Fuel,
    logo: '/images/logo-repsol.png',
    accent: 'bg-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500',
    text: 'text-red-600 dark:text-red-400',
    desc: 'Solred — movimentos de combustível',
  },
  {
    value: 'edp',
    label: 'EDP',
    icon: Zap,
    logo: '/images/logo-edp.png',
    accent: 'bg-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    desc: 'Mobilidade — carregamentos elétricos',
  },
  {
    value: 'viaverde',
    label: 'Via Verde',
    icon: Ticket,
    logo: '/images/logo-via-verde.png',
    accent: 'bg-green-600',
    bg: 'bg-green-600/10',
    border: 'border-green-600',
    text: 'text-green-700 dark:text-green-400',
    desc: 'Portagens — por matrícula da viatura',
  },
];

// Mostra a logo da plataforma; se a imagem falhar, cai no ícone Lucide.
const PlatLogo: React.FC<{ cfg: PlataformaConfig; className?: string }> = ({ cfg, className }) => {
  const [erro, setErro] = useState(false);
  const Icon = cfg.icon;
  if (erro) return <Icon className={className ?? 'h-7 w-7'} />;
  return (
    <img
      src={cfg.logo}
      alt={cfg.label}
      className="h-9 w-9 object-contain"
      onError={() => setErro(true)}
    />
  );
};

interface Integracao {
  id: string;
  nome: string;
  company_name: string | null;
  ativo: boolean;
  plataforma: string;
  robot_target_platform: string | null;
}

interface ImportarDadosWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

type Passo = 1 | 2 | 3 | 4;

const PASSOS_LABELS = ['Plataforma', 'Conta', 'Semana', 'Ficheiro'];

const fmtDate = (d: Date) => format(d, 'yyyy-MM-dd');

// Lê o ficheiro como texto CSV. Se for Excel (.xlsx/.xls), converte a 1ª folha
// para CSV (separador ';' — seguro com decimais/moradas que usam vírgula).
async function fileToCsvText(file: File): Promise<string> {
  const nome = file.name.toLowerCase();
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // rawNumbers:false → usa os valores como aparecem no Excel (datas/números formatados)
    return XLSX.utils.sheet_to_csv(ws, { FS: ';', blankrows: false, rawNumbers: false });
  }
  return file.text();
}

export const ImportarDadosWizard: React.FC<ImportarDadosWizardProps> = ({
  open,
  onOpenChange,
  onImportComplete,
}) => {
  const [passo, setPasso] = useState<Passo>(1);
  const [plataforma, setPlataforma] = useState<Plataforma | null>(null);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [carregandoIntegracoes, setCarregandoIntegracoes] = useState(false);
  const [integracaoId, setIntegracaoId] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<Date>(subWeeks(new Date(), 1));
  const [file, setFile] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [existeImportacao, setExisteImportacao] = useState<{
    quantidade: number;
    ultimaData: string | null;
  } | null>(null);
  const [verificandoExistencia, setVerificandoExistencia] = useState(false);

  // Última importação por conta (carregado quando entra no passo 2)
  // Map: integracao_id → { ultimaData, ultimaSemana? }
  const [ultimaImportPorConta, setUltimaImportPorConta] = useState<
    Record<string, { ultimaData: string; ultimaSemana?: { inicio: string; fim: string } }>
  >({});
  const [carregandoUltimas, setCarregandoUltimas] = useState(false);

  const cfg = plataforma ? PLATAFORMAS.find((p) => p.value === plataforma)! : null;

  // Reset quando abre.
  useEffect(() => {
    if (open) {
      setPasso(1);
      setPlataforma(null);
      setIntegracaoId(null);
      setSelectedWeek(subWeeks(new Date(), 1));
      setFile(null);
      setImportando(false);
      setExisteImportacao(null);
      setUltimaImportPorConta({});
    }
  }, [open]);

  // Quando muda para plataforma definida + tem integrações, carregar última
  // importação por cada conta para mostrar badge no passo 2.
  useEffect(() => {
    if (!plataforma || integracoes.length === 0) {
      setUltimaImportPorConta({});
      return;
    }
    let cancelled = false;
    const carregar = async () => {
      setCarregandoUltimas(true);
      const ids = integracoes.map((i) => i.id);
      const resultado: Record<
        string,
        { ultimaData: string; ultimaSemana?: { inicio: string; fim: string } }
      > = {};
      try {
        // RPC única que devolve para cada integração: ultima_data + periodo coberto.
        // Substitui N+1 queries por uma só (1 round-trip).
        // Cast porque types.ts ainda não foi regenerado após nova RPC.
        const { data, error } = await (supabase as any).rpc(
          'get_ultima_importacao_por_integracao',
          { p_plataforma: plataforma, p_ids: ids }
        );
        if (error) throw error;
        (data as any[] | null)?.forEach((row) => {
          if (!row.integracao_id) return;
          resultado[row.integracao_id] = {
            ultimaData: row.ultima_data || '',
            ultimaSemana:
              row.periodo_inicio && row.periodo_fim
                ? { inicio: row.periodo_inicio, fim: row.periodo_fim }
                : undefined,
          };
        });
        if (!cancelled) setUltimaImportPorConta(resultado);
      } catch (err) {
        if (!cancelled) setUltimaImportPorConta({});
      } finally {
        if (!cancelled) setCarregandoUltimas(false);
      }
    };
    carregar();
    return () => {
      cancelled = true;
    };
  }, [plataforma, integracoes]);

  // Quando escolhe a plataforma, vai buscar as integrações.
  useEffect(() => {
    if (!plataforma) {
      setIntegracoes([]);
      return;
    }
    const fetchIntegracoes = async () => {
      setCarregandoIntegracoes(true);
      try {
        const { data, error } = await supabase
          .from('plataformas_configuracao')
          .select('id, nome, company_name, ativo, plataforma, robot_target_platform')
          .or(
            `plataforma.eq.${plataforma},and(plataforma.eq.robot,robot_target_platform.eq.${plataforma})`
          )
          .eq('ativo', true)
          .order('nome');
        if (error) throw error;
        setIntegracoes((data || []) as Integracao[]);
      } catch (err: any) {
        toast.error(err.message || 'Erro ao carregar integrações');
      } finally {
        setCarregandoIntegracoes(false);
      }
    };
    fetchIntegracoes();
  }, [plataforma]);

  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const isCurrentWeek = isThisWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });

  const weekLabel = `${format(weekStart, 'dd MMM', { locale: pt })} – ${format(weekEnd, 'dd MMM yyyy', { locale: pt })}`;

  // Verificar se já existe importação para (plataforma + conta + semana)
  useEffect(() => {
    if (!plataforma || !integracaoId) {
      setExisteImportacao(null);
      return;
    }
    let cancelled = false;
    const verificar = async () => {
      setVerificandoExistencia(true);
      try {
        const wStart = fmtDate(weekStart);
        const wEnd = fmtDate(weekEnd);
        const wStartIso = `${wStart}T00:00:00`;
        const wEndIso = `${wEnd}T23:59:59`;

        let result: { count: number | null; latest: string | null } = {
          count: null,
          latest: null,
        };

        if (plataforma === 'bolt') {
          const { count } = await supabase
            .from('bolt_resumos_semanais')
            .select('*', { count: 'exact', head: true })
            .eq('integracao_id', integracaoId)
            .lte('periodo_inicio', wEnd)
            .gte('periodo_fim', wStart);
          result.count = count ?? 0;
          if ((count ?? 0) > 0) {
            const { data } = await supabase
              .from('bolt_resumos_semanais')
              .select('created_at')
              .eq('integracao_id', integracaoId)
              .lte('periodo_inicio', wEnd)
              .gte('periodo_fim', wStart)
              .order('created_at', { ascending: false })
              .limit(1);
            result.latest = data?.[0]?.created_at || null;
          }
        } else if (plataforma === 'uber') {
          const { count } = await supabase
            .from('uber_transactions')
            .select('*', { count: 'exact', head: true })
            .eq('integracao_id', integracaoId)
            .gte('occurred_at', wStartIso)
            .lte('occurred_at', wEndIso);
          result.count = count ?? 0;
          if ((count ?? 0) > 0) {
            const { data } = await supabase
              .from('uber_transactions')
              .select('created_at')
              .eq('integracao_id', integracaoId)
              .gte('occurred_at', wStartIso)
              .lte('occurred_at', wEndIso)
              .order('created_at', { ascending: false })
              .limit(1);
            result.latest = data?.[0]?.created_at || null;
          }
        } else {
          // bp / repsol / edp / viaverde
          const table = (
            plataforma === 'viaverde' ? 'via_verde_transacoes' : `${plataforma}_transacoes`
          ) as 'bp_transacoes' | 'repsol_transacoes' | 'edp_transacoes' | 'via_verde_transacoes';
          const { count } = await (supabase as any)
            .from(table)
            .select('*', { count: 'exact', head: true })
            .eq('integracao_id', integracaoId)
            .gte('transaction_date', wStartIso)
            .lte('transaction_date', wEndIso);
          result.count = count ?? 0;
          if ((count ?? 0) > 0) {
            const { data } = await (supabase as any)
              .from(table)
              .select('created_at')
              .eq('integracao_id', integracaoId)
              .gte('transaction_date', wStartIso)
              .lte('transaction_date', wEndIso)
              .order('created_at', { ascending: false })
              .limit(1);
            result.latest = data?.[0]?.created_at || null;
          }
        }

        if (cancelled) return;
        setExisteImportacao(
          (result.count ?? 0) > 0 ? { quantidade: result.count!, ultimaData: result.latest } : null
        );
      } catch (err) {
        if (!cancelled) setExisteImportacao(null);
      } finally {
        if (!cancelled) setVerificandoExistencia(false);
      }
    };
    verificar();
    return () => {
      cancelled = true;
    };
  }, [plataforma, integracaoId, selectedWeek]);

  const handleImportar = async () => {
    if (!plataforma || !integracaoId || !file) return;
    setImportando(true);
    try {
      const csvText = await fileToCsvText(file);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Sessão inválida. Inicie sessão novamente.');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      let url = '';
      let body: Record<string, unknown> = {};

      if (plataforma === 'bolt') {
        url = `https://${projectId}.supabase.co/functions/v1/bolt-import-csv`;
        body = {
          integracao_id: integracaoId,
          dados_csv_bolt: csvText,
          periodo: `${fmtDate(weekStart)} a ${fmtDate(weekEnd)}`,
          periodo_inicio: fmtDate(weekStart),
          periodo_fim: fmtDate(weekEnd),
          origem: 'Upload Manual (Contas)',
        };
      } else if (plataforma === 'uber') {
        url = `https://${projectId}.supabase.co/functions/v1/uber-webhook?integracao_id=${integracaoId}`;
        // Prefixa o nome com YYYYMMDD-YYYYMMDD para a edge function detectar a
        // semana (occurred_at default) — caso o CSV não tenha coluna de data.
        const wStart = fmtDate(weekStart).replace(/-/g, '');
        const wEnd = fmtDate(weekEnd).replace(/-/g, '');
        const nomeComPeriodo = /^\d{8}-\d{8}/.test(file.name)
          ? file.name
          : `${wStart}-${wEnd}-${file.name}`;
        body = {
          integracao_id: integracaoId,
          dados_csv_brutos: csvText,
          origem: 'Upload Manual (Contas)',
          nome_original: nomeComPeriodo,
          data_extracao: new Date().toISOString(),
        };
      } else {
        // bp / repsol / edp / viaverde
        url = `https://${projectId}.supabase.co/functions/v1/${plataforma}-import-csv`;
        body = { integracao_id: integracaoId, combustivel_csv: csvText };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      console.log(`[ImportarDadosWizard] resposta ${plataforma}:`, data);
      if (!response.ok || data.success === false) {
        throw new Error(data.error || `Erro ${response.status}`);
      }

      // Cobre todos os formatos de resposta (bolt: imported, uber: inserted+updated, bp/repsol/edp: variados)
      const insertedOrUpdated =
        (typeof data.inserted === 'number' ? data.inserted : 0) +
        (typeof data.updated === 'number' ? data.updated : 0);
      const imp =
        data.imported ??
        (insertedOrUpdated > 0 ? insertedOrUpdated : undefined) ??
        data.processados ??
        data.total_imported ??
        data.matched ??
        0;
      const errs = data.errors ?? data.erros ?? 0;
      const totalRows = data.total_rows ?? data.total ?? imp;

      if (imp === 0) {
        toast.warning(
          `Importação concluída mas 0 registos gravados. Verifica o ficheiro ou a integração escolhida.`,
          { description: errs > 0 ? `${errs} erro(s) durante o processamento.` : undefined }
        );
      } else {
        toast.success(`${imp} registo(s) ${plataforma.toUpperCase()} importado(s).`, {
          description:
            errs > 0
              ? `${errs} erro(s) de ${totalRows} linha(s)`
              : `Período: ${data.periodo || `${fmtDate(weekStart)} a ${fmtDate(weekEnd)}`}`,
        });
      }
      onImportComplete?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar');
    } finally {
      setImportando(false);
    }
  };

  const podeAvancar =
    (passo === 1 && !!plataforma) ||
    (passo === 2 && !!integracaoId) ||
    (passo === 3 && !!selectedWeek) ||
    (passo === 4 && !!file && !importando);

  const avancar = () => {
    if (!podeAvancar) return;
    if (passo < 4) setPasso((passo + 1) as Passo);
    else handleImportar();
  };

  const voltar = () => {
    if (passo > 1) setPasso((passo - 1) as Passo);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Importar Dados das Plataformas
          </DialogTitle>
          <DialogDescription>
            Passo a passo para enviar o ficheiro CSV da semana correta para a integração certa.
          </DialogDescription>
        </DialogHeader>

        {/* Indicador de passos */}
        <StepIndicator passo={passo} accent={cfg?.accent ?? 'bg-primary'} />

        <div className="min-h-[280px] py-2">
          {passo === 1 && <PassoPlataforma plataforma={plataforma} onSelect={setPlataforma} />}
          {passo === 2 && cfg && (
            <PassoConta
              cfg={cfg}
              integracoes={integracoes}
              carregando={carregandoIntegracoes}
              selecionado={integracaoId}
              onSelect={setIntegracaoId}
              ultimaImportPorConta={ultimaImportPorConta}
              carregandoUltimas={carregandoUltimas}
            />
          )}
          {passo === 3 && cfg && (
            <PassoSemana
              cfg={cfg}
              selectedWeek={selectedWeek}
              setSelectedWeek={setSelectedWeek}
              weekStart={weekStart}
              weekEnd={weekEnd}
              weekLabel={weekLabel}
              isCurrentWeek={isCurrentWeek}
              existeImportacao={existeImportacao}
              verificando={verificandoExistencia}
            />
          )}
          {passo === 4 && cfg && (
            <PassoFicheiro
              cfg={cfg}
              file={file}
              setFile={setFile}
              weekLabel={weekLabel}
              integracao={integracoes.find((i) => i.id === integracaoId)}
              existeImportacao={existeImportacao}
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={voltar}
            disabled={passo === 1 || importando}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <span className="text-xs text-muted-foreground">
            Passo {passo} de 4 — {PASSOS_LABELS[passo - 1]}
          </span>
          <Button
            type="button"
            onClick={avancar}
            disabled={!podeAvancar}
            className={cn('gap-2 text-white', cfg ? cn(cfg.accent, 'hover:opacity-90') : '')}
          >
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {passo === 4 ? 'Importar' : 'Continuar'}
            {passo < 4 && !importando ? <ArrowRight className="h-4 w-4" /> : null}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================
// Indicador de passos
// ============================================================

const StepIndicator: React.FC<{ passo: number; accent: string }> = ({ passo, accent }) => (
  <div className="flex items-center justify-between gap-1 px-1 py-2">
    {[1, 2, 3, 4].map((n, idx) => {
      const ativo = passo >= n;
      const completo = passo > n;
      return (
        <div key={n} className="flex items-center flex-1">
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all',
              ativo ? cn(accent, 'text-white shadow-sm') : 'bg-muted text-muted-foreground'
            )}
          >
            {completo ? <Check className="h-4 w-4" /> : n}
          </div>
          <span
            className={cn(
              'ml-2 hidden text-xs font-semibold sm:inline',
              ativo ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {PASSOS_LABELS[n - 1]}
          </span>
          {idx < 3 && (
            <div
              className={cn(
                'mx-2 h-0.5 flex-1 rounded-full transition-all',
                passo > n ? accent : 'bg-muted'
              )}
            />
          )}
        </div>
      );
    })}
  </div>
);

// ============================================================
// Passo 1 — Plataforma
// ============================================================

const PassoPlataforma: React.FC<{
  plataforma: Plataforma | null;
  onSelect: (p: Plataforma) => void;
}> = ({ plataforma, onSelect }) => (
  <div>
    <p className="mb-3 text-sm text-muted-foreground">
      Escolhe a plataforma do ficheiro CSV que vais importar.
    </p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {PLATAFORMAS.map((p) => {
        const selecionado = plataforma === p.value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => onSelect(p.value)}
            className={cn(
              'group flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-left transition-all duration-200',
              selecionado
                ? cn(p.border, 'bg-background shadow-md')
                : 'border-border bg-background hover:-translate-y-0.5 hover:shadow-sm'
            )}
          >
            <span
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-border',
                p.text
              )}
            >
              <PlatLogo cfg={p} className="h-7 w-7" />
            </span>
            <span className="text-sm font-semibold">{p.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);

// ============================================================
// Passo 2 — Conta (integração)
// ============================================================

const PassoConta: React.FC<{
  cfg: PlataformaConfig;
  integracoes: Integracao[];
  carregando: boolean;
  selecionado: string | null;
  onSelect: (id: string) => void;
  ultimaImportPorConta: Record<
    string,
    { ultimaData: string; ultimaSemana?: { inicio: string; fim: string } }
  >;
  carregandoUltimas: boolean;
}> = ({
  cfg,
  integracoes,
  carregando,
  selecionado,
  onSelect,
  ultimaImportPorConta,
  carregandoUltimas,
}) => {
  const Icon = cfg.icon;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn('flex h-7 w-7 items-center justify-center rounded-lg', cfg.bg, cfg.text)}
        >
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-sm text-muted-foreground">
          Em qual conta <strong className="text-foreground">{cfg.label}</strong> vais importar?
        </p>
      </div>
      {carregando ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : integracoes.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Não há integrações <strong>{cfg.label}</strong> ativas. Cria uma em
          <em> Definições › Integrações</em>.
        </div>
      ) : (
        <div className="grid gap-2">
          {integracoes.map((i) => {
            const ativa = selecionado === i.id;
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => onSelect(i.id)}
                className={cn(
                  'flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all',
                  ativa
                    ? cn(cfg.border, cfg.bg, 'shadow-sm')
                    : 'border-border bg-background hover:bg-muted/40'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    ativa ? cn(cfg.accent, 'text-white') : cn(cfg.bg, cfg.text)
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{i.company_name || i.nome}</p>
                  {i.company_name && i.company_name !== i.nome && (
                    <p className="text-xs text-muted-foreground">{i.nome}</p>
                  )}
                  {(() => {
                    const ultima = ultimaImportPorConta[i.id];
                    if (carregandoUltimas) {
                      return (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/70">
                          <Loader2 className="h-3 w-3 animate-spin" /> A verificar…
                        </p>
                      );
                    }
                    if (!ultima) {
                      return (
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
                          Sem importações ainda
                        </p>
                      );
                    }
                    const semanaLabel = ultima.ultimaSemana
                      ? `${format(new Date(ultima.ultimaSemana.inicio), 'dd/MM', { locale: pt })} – ${format(new Date(ultima.ultimaSemana.fim), 'dd/MM/yyyy', { locale: pt })}`
                      : null;
                    return (
                      <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {semanaLabel ? (
                          <>
                            Última semana: <strong>{semanaLabel}</strong>
                            <span className="text-muted-foreground/70">
                              · enviado em{' '}
                              {format(new Date(ultima.ultimaData), 'dd/MM HH:mm', { locale: pt })}
                            </span>
                          </>
                        ) : (
                          <>
                            Último envio:{' '}
                            {format(new Date(ultima.ultimaData), "dd/MM/yyyy 'às' HH:mm", {
                              locale: pt,
                            })}
                          </>
                        )}
                      </p>
                    );
                  })()}
                </div>
                {ativa && <CheckCircle2 className={cn('h-5 w-5', cfg.text)} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================
// Passo 3 — Semana
// ============================================================

const PassoSemana: React.FC<{
  cfg: PlataformaConfig;
  selectedWeek: Date;
  setSelectedWeek: (d: Date) => void;
  weekStart: Date;
  weekEnd: Date;
  weekLabel: string;
  isCurrentWeek: boolean;
  existeImportacao: { quantidade: number; ultimaData: string | null } | null;
  verificando: boolean;
}> = ({
  cfg,
  selectedWeek,
  setSelectedWeek,
  weekStart,
  weekEnd,
  weekLabel,
  isCurrentWeek,
  existeImportacao,
  verificando,
}) => {
  const Icon = cfg.icon;
  const atalhos = [
    { label: 'Semana passada', date: subWeeks(new Date(), 1) },
    { label: 'Há 2 semanas', date: subWeeks(new Date(), 2) },
    { label: 'Há 3 semanas', date: subWeeks(new Date(), 3) },
    { label: 'Há 4 semanas', date: subWeeks(new Date(), 4) },
  ];
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn('flex h-7 w-7 items-center justify-center rounded-lg', cfg.bg, cfg.text)}
        >
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-sm text-muted-foreground">
          Qual semana corresponde a este ficheiro{' '}
          <strong className="text-foreground">{cfg.label}</strong>?
        </p>
      </div>

      <div className="rounded-xl border bg-muted/10 p-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setSelectedWeek(subWeeks(selectedWeek, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[280px] justify-center font-medium">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {weekLabel}
                {isCurrentWeek && (
                  <span className="ml-2 text-xs text-muted-foreground">(Atual)</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <div className="border-b p-3">
                <div className="flex flex-wrap gap-1.5">
                  {atalhos.map((a) => (
                    <Button
                      key={a.label}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setSelectedWeek(a.date)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
              <CalendarComponent
                mode="single"
                selected={selectedWeek}
                onSelect={(d) => d && setSelectedWeek(d)}
                weekStartsOn={WEEK_STARTS_ON}
                locale={pt}
                modifiers={{ selected: { from: weekStart, to: weekEnd } }}
                modifiersStyles={{
                  selected: {
                    backgroundColor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                    borderRadius: 0,
                  },
                }}
              />
              <div className="border-t bg-muted/40 p-2 text-center text-xs text-muted-foreground">
                Clica num dia para selecionar a semana (Seg-Dom)
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setSelectedWeek(addWeeks(selectedWeek, 1))}
            disabled={isCurrentWeek}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Por defeito: <strong>semana passada</strong>.
        </p>
      </div>

      {verificando && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />A verificar importações anteriores…
        </div>
      )}

      {!verificando && existeImportacao && (
        <div className="mt-3 flex items-start gap-3 rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="font-semibold text-amber-700 dark:text-amber-300">
              Já existe importação para esta semana
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
              {existeImportacao.quantidade} registo(s) já gravado(s)
              {existeImportacao.ultimaData &&
                ` · última: ${format(new Date(existeImportacao.ultimaData), "dd/MM 'às' HH:mm", { locale: pt })}`}
              . Se importares de novo, os registos serão atualizados (não duplicam).
            </p>
          </div>
        </div>
      )}

      {!verificando && !existeImportacao && (
        <div className="mt-3 flex items-start gap-3 rounded-lg border bg-muted/10 p-3 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          Nenhuma importação encontrada para esta combinação. Vais ser o primeiro a importar.
        </div>
      )}
    </div>
  );
};

// ============================================================
// Passo 4 — Ficheiro
// ============================================================

const PassoFicheiro: React.FC<{
  cfg: PlataformaConfig;
  file: File | null;
  setFile: (f: File | null) => void;
  weekLabel: string;
  integracao?: Integracao;
  existeImportacao: { quantidade: number; ultimaData: string | null } | null;
}> = ({ cfg, file, setFile, weekLabel, integracao, existeImportacao }) => {
  const Icon = cfg.icon;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn('flex h-7 w-7 items-center justify-center rounded-lg', cfg.bg, cfg.text)}
        >
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-sm text-muted-foreground">Carrega o ficheiro CSV.</p>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg border bg-muted/10 p-3 text-xs sm:grid-cols-3">
        <div>
          <p className="font-semibold text-foreground">Plataforma</p>
          <p className="text-muted-foreground">{cfg.label}</p>
        </div>
        <div>
          <p className="font-semibold text-foreground">Conta</p>
          <p className="truncate text-muted-foreground">
            {integracao?.company_name || integracao?.nome || '—'}
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground">Semana</p>
          <p className="text-muted-foreground">{weekLabel}</p>
        </div>
      </div>

      {existeImportacao && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2.5 text-xs">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-amber-700 dark:text-amber-300">
            <strong>Já existe importação</strong> para esta semana ({existeImportacao.quantidade}{' '}
            registo
            {existeImportacao.quantidade !== 1 ? 's' : ''}). Importar de novo substitui pelos novos
            valores.
          </span>
        </div>
      )}

      <label
        htmlFor="wizard-file"
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-all',
          file ? cn(cfg.border, cfg.bg) : 'border-border bg-muted/10 hover:bg-muted/30'
        )}
      >
        <input
          id="wizard-file"
          type="file"
          accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-xl',
            file ? cn(cfg.accent, 'text-white') : 'bg-muted text-muted-foreground'
          )}
        >
          <Upload className="h-5 w-5" />
        </span>
        {file ? (
          <>
            <p className="font-semibold">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB · clica para trocar
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">Clica para escolher o ficheiro</p>
            <p className="text-xs text-muted-foreground">CSV ou Excel (.xlsx)</p>
          </>
        )}
      </label>
    </div>
  );
};
