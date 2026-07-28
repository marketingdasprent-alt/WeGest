import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import {
  CircleCheck,
  Car,
  CalendarClock,
  Wrench,
  TrendingUp,
  FileText,
  ShieldAlert,
  Wallet,
  UserPlus,
  RefreshCw,
  LayoutDashboard,
  CalendarRange,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import {
  format,
  startOfWeek,
  startOfMonth,
  startOfYear,
  endOfMonth,
  endOfDay,
  subMonths,
  addMonths,
  differenceInCalendarDays,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachDayOfInterval,
} from 'date-fns';
import { pt } from 'date-fns/locale';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { useDashboardVariant } from '@/hooks/useDashboardVariant';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchViaturasOcupacao } from '@/hooks/useViaturasOcupacao';
import { deriveViaturaEstado, ESTADOS_EM_USO } from '@/lib/viaturas';
import { useContasAReceber } from '@/hooks/useContasAReceber';
import { CheckinCheckoutHistoricoCard } from '@/components/dashboard/CheckinCheckoutHistoricoCard';
import { CartrackMapCard } from '@/components/dashboard/CartrackMapCard';
import { cn } from '@/lib/utils';
import type { ChartPoint } from '@/components/dashboard/ReceitaChart';
import type { FrotaDonutData } from '@/components/dashboard/FrotaDonutChart';

const ReceitaChart = lazy(() => import('@/components/dashboard/ReceitaChart'));
const FrotaDonutChart = lazy(() => import('@/components/dashboard/FrotaDonutChart'));

// ── Types ────────────────────────────────────────────────────────────────────

interface FleetCounts {
  total: number;
  disponiveis: number;
  alugadas: number;
  reservadas: number;
  oficina: number;
}

interface EventoAtividade {
  tipo: string;
  data_inicio: string;
  valor_aluguer: number;
}

/** Período do gráfico "Atividade". `personalizado` não tem range fixo — vem
 *  das duas datas escolhidas no calendário. */
type PeriodPreset = 'semana' | 'mes' | 'trimestre' | 'ano' | 'personalizado';
type FixedPreset = Exclude<PeriodPreset, 'personalizado'>;
type Granularidade = 'dia' | 'semana' | 'mes';

interface DateRange {
  from: Date;
  to: Date;
}

type CorAlerta = 'destructive' | 'warning';

interface CategoriaAlerta {
  id: string;
  icon: typeof FileText;
  cor: CorAlerta;
  titulo: string;
  descricao: string;
  href: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

function normalizarMatricula(m: string | null | undefined): string {
  return (m ?? '').replace(/[-\s]/g, '').toUpperCase();
}

const PRESET_LABELS: Record<FixedPreset, string> = {
  semana: 'Esta Semana',
  mes: 'Este Mês',
  trimestre: 'Trimestre',
  ano: 'Este Ano',
};

function getPeriodRange(preset: FixedPreset): DateRange {
  const now = new Date();
  switch (preset) {
    case 'semana':
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
    case 'mes':
      return { from: startOfMonth(now), to: now };
    case 'trimestre':
      // "Trimestre" = últimos 3 meses corridos (não o trimestre civil) — é o
      // que a operação usa para comparar, e era o comportamento anterior.
      return { from: subMonths(now, 3), to: now };
    case 'ano':
      return { from: startOfYear(now), to: now };
  }
}

/** A granularidade não é escolha do utilizador — se fosse, teríamos dois
 *  controlos de tempo lado a lado a dizer "Semana" e a parecerem o mesmo. Sai
 *  do tamanho do intervalo, procurando ~5 a 15 barras: um ano ao dia dava 365
 *  barras ilegíveis, uma semana ao mês dava uma só. */
function granularidadePara({ from, to }: DateRange): Granularidade {
  const dias = differenceInCalendarDays(to, from) + 1;
  if (dias <= 14) return 'dia';
  if (dias <= 92) return 'semana';
  return 'mes';
}

/** Constrói os pontos do gráfico de atividade a partir dos eventos já
 *  carregados (não faz novas queries) — o intervalo vem do seletor de período
 *  e os eventos já foram buscados para esse mesmo intervalo. */
function buildChartPoints(
  eventos: EventoAtividade[],
  inicio: Date,
  fim: Date,
  granularidade: Granularidade
): ChartPoint[] {
  const calcBucket = (
    bucketStart: Date,
    bucketEnd: Date,
    label: string,
    periodo: string
  ): ChartPoint => {
    const bStartStr = bucketStart.toISOString().split('T')[0];
    const bEndStr = bucketEnd.toISOString().split('T')[0];

    const eventosBucket = eventos.filter((ev) => {
      const evDate = ev.data_inicio.split('T')[0];
      return evDate >= bStartStr && evDate <= bEndStr;
    });
    const entregasBucket = eventosBucket.filter((ev) => ev.tipo === 'entrega');
    const alugados = entregasBucket.length;
    const devolvidos = eventosBucket.filter(
      (ev) => ev.tipo === 'devolucao' || ev.tipo === 'recolha'
    ).length;
    const receitaContratada = entregasBucket.reduce((sum, ev) => sum + ev.valor_aluguer, 0);

    return { periodo, label, receitaContratada, alugados, devolvidos };
  };

  if (granularidade === 'dia') {
    const dias = eachDayOfInterval({ start: inicio, end: fim });
    return dias.map((dia) =>
      calcBucket(dia, dia, format(dia, 'dd MMM', { locale: pt }), format(dia, 'dd/MM'))
    );
  }

  if (granularidade === 'mes') {
    const meses = eachMonthOfInterval({ start: inicio, end: fim });
    return meses.map((mesInicio, i) => {
      // O último balde fecha em `fim` (o mês em curso está incompleto), os
      // restantes no fim do próprio mês.
      const mesFim = i + 1 < meses.length ? endOfMonth(mesInicio) : fim;
      return calcBucket(
        mesInicio,
        mesFim,
        format(mesInicio, 'MMMM yyyy', { locale: pt }),
        format(mesInicio, 'MMM yy', { locale: pt })
      );
    });
  }

  const semanas = eachWeekOfInterval({ start: inicio, end: fim }, { weekStartsOn: 1 });
  return semanas.map((semanaInicio, i) => {
    const semanaFim = i + 1 < semanas.length ? new Date(semanas[i + 1].getTime() - 1) : fim;
    return calcBucket(
      semanaInicio,
      semanaFim,
      `Semana ${format(semanaInicio, 'dd MMM', { locale: pt })}`,
      format(semanaInicio, 'dd/MM', { locale: pt })
    );
  });
}

/** Anima um valor de 0 até `target` — respeita prefers-reduced-motion.
 *  Reanima do zero sempre que `target` muda (ex: depois de um refresh), o
 *  que é uma leitura aceitável de "os dados actualizaram-se". */
function useCountUp(target: number, durationMs = 850): number {
  const [display, setDisplay] = useState(0);
  const prefersReduced = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (prefersReduced.current) {
      setDisplay(target);
      return;
    }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return display;
}

// ── Dashboard Component ───────────────────────────────────────────────────────

const Dashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isExecutivo } = useDashboardVariant();
  // Query própria (não faz parte do fetchData sequencial abaixo) — dá-lhe o
  // seu próprio loading, em vez de ficar bloqueada atrás do resto da homepage.
  const { data: contasAReceber } = useContasAReceber();

  const [loading, setLoading] = useState(true);
  // `loading` é só a primeira carga (skeleton de página inteira); `atualizando`
  // são os refetches seguintes, que não podem fazer a página piscar.
  const [atualizando, setAtualizando] = useState(false);
  const jaCarregou = useRef(false);
  const [preset, setPreset] = useState<PeriodPreset>('mes');
  const [range, setRange] = useState<DateRange>(() => getPeriodRange('mes'));
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [customRangeDraft, setCustomRangeDraft] = useState<DayPickerRange | undefined>();

  const [fleet, setFleet] = useState<FleetCounts>({
    total: 0,
    disponiveis: 0,
    alugadas: 0,
    reservadas: 0,
    oficina: 0,
  });
  const [frotaDonut, setFrotaDonut] = useState<FrotaDonutData>({
    disponiveis: 0,
    ocupados: 0,
    inativos: 0,
  });
  const [candidaturasPendentes, setCandidaturasPendentes] = useState(0);
  const [extintoresAPrazo, setExtintoresAPrazo] = useState<any[]>([]);
  const [contratosAPrazo, setContratosAPrazo] = useState<any[]>([]);
  const [contratosExpirados, setContratosExpirados] = useState<any[]>([]);
  const [receitaContratadaPeriodo, setReceitaContratadaPeriodo] = useState(0);
  const [eventosAtividade, setEventosAtividade] = useState<EventoAtividade[]>([]);
  // Intervalo a que os `eventosAtividade` em memória correspondem — só é
  // actualizado no fim do fetch, para o gráfico não re-agrupar com o período
  // novo enquanto os eventos ainda são os do período anterior.
  const [inicioRef, setInicioRef] = useState(() => startOfMonth(new Date()));
  const [fimRef, setFimRef] = useState(() => new Date());

  // ── Seleção de período ───────────────────────────────────────────────────

  const aplicarRange = (p: PeriodPreset, r: DateRange) => {
    setPreset(p);
    setRange(r);
  };

  const handlePreset = (p: FixedPreset) => {
    aplicarRange(p, getPeriodRange(p));
    setCustomRangeOpen(false);
  };

  // Intervalo personalizado: só aplica quando as duas datas (from/to) estão
  // escolhidas — um clique único no Calendar em modo "range" só define `from`.
  const handleCustomRangeSelect = (picked: DayPickerRange | undefined) => {
    setCustomRangeDraft(picked);
    if (picked?.from && picked?.to) {
      // `to` vem às 00:00 do dia escolhido; sem endOfDay perdiam-se os eventos
      // desse último dia (a query e os baldes são inclusivos até `to`).
      aplicarRange('personalizado', { from: picked.from, to: endOfDay(picked.to) });
      setCustomRangeOpen(false);
    }
  };

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      // Só a PRIMEIRA carga troca a homepage inteira pelo skeleton. Mudar de
      // período (ou carregar em Atualizar) mantém tudo no ecrã e sinaliza-se
      // apenas no gráfico — senão a página desaparecia e voltava a cada clique
      // no seletor, quando na verdade só o gráfico depende do período.
      if (!jaCarregou.current) setLoading(true);
      setAtualizando(true);

      // O período escolhido no seletor alimenta o gráfico "Atividade" e a
      // receita contratada mostrada na sua legenda — o resto do dashboard
      // (frota, alertas) é sempre do momento actual, não do período.
      const now = new Date();

      // ── Frota — o estado é derivado das ocupações ativas (contrato /
      // reserva / movimentação / reparação), igual à listagem da Frota — não
      // do campo `status` (em_uso manual foi descontinuado).
      const [{ data: viaturas }, ocupacao] = await Promise.all([
        supabase
          .from('viaturas')
          .select('id, status, is_slot, is_vendida, matricula, valor_aluguer'),
        fetchViaturasOcupacao(),
      ]);

      // Mesma lógica de exclusão que a página Viaturas (src/pages/Viaturas.tsx):
      // vendidas saem via `is_vendida` (não via `status`, que pode divergir do
      // booleano). Calcula-se o estado de toda a frota não-vendida uma única
      // vez — o donut usa-a completa (incl. inativas), o resto do dashboard
      // exclui as inativas (não contam para a frota operacional; incluí-las
      // no denominador da Ocupação dava percentagens sem sentido).
      const estadosFrotaCompleta = (viaturas ?? [])
        .filter((v) => !v.is_vendida)
        .map((v) =>
          deriveViaturaEstado(
            { status: v.status, is_slot: v.is_slot, is_vendida: v.is_vendida },
            ocupacao.get(v.id)
          )
        );

      setFrotaDonut({
        disponiveis: estadosFrotaCompleta.filter((e) => e === 'disponivel').length,
        ocupados: estadosFrotaCompleta.filter((e) => e !== 'disponivel' && e !== 'inativo').length,
        inativos: estadosFrotaCompleta.filter((e) => e === 'inativo').length,
      });

      const estadosFrota = estadosFrotaCompleta
        .filter((e) => e !== 'inativo')
        .map((estado) => ({ estado }));

      setFleet({
        total: estadosFrota.length,
        disponiveis: estadosFrota.filter((e) => e.estado === 'disponivel').length,
        alugadas: estadosFrota.filter(
          (e) =>
            e.estado !== 'em_reserva' && (ESTADOS_EM_USO as readonly string[]).includes(e.estado)
        ).length,
        reservadas: estadosFrota.filter((e) => e.estado === 'em_reserva').length,
        oficina: estadosFrota.filter((e) => e.estado === 'manutencao').length,
      });

      // ── Restante — todas independentes entre si (só dependem dos
      // `viaturas` já carregados acima) — disparadas de uma vez, não em
      // cascata.
      const limitExtintor = new Date();
      limitExtintor.setDate(limitExtintor.getDate() + 15);
      const extStrStr = limitExtintor.toISOString().split('T')[0];

      const [
        { data: extintoresData },
        { data: contratosAtivos, error: contratosErr },
        { count: pendentes },
        { data: eventosMesData },
      ] = await Promise.all([
        supabase
          .from('viaturas')
          .select(
            `
          id,
          matricula,
          extintor_validade,
          motorista_viaturas(
            status,
            motoristas_ativos(nome)
          )
        `
          )
          .not('extintor_validade', 'is', null)
          .lte('extintor_validade', extStrStr)
          .order('extintor_validade', { ascending: true }),
        supabase
          .from('contratos')
          .select(
            'id, numero_contrato, data_inicio, data_fim, duracao_meses, motorista_nome, motorista_id, viatura_id, viaturas:viatura_id(matricula)'
          )
          .eq('status', 'ativo')
          .not('data_inicio', 'is', null),
        supabase
          .from('motorista_candidaturas')
          .select('id', { count: 'exact', head: true })
          .in('status', ['submetido', 'em_analise']),
        supabase
          .from('calendario_eventos')
          .select('tipo, data_inicio, titulo')
          .in('tipo', ['entrega', 'devolucao', 'recolha'])
          .gte('data_inicio', range.from.toISOString())
          .lte('data_inicio', range.to.toISOString()),
      ]);

      // ── Extintores ────────────────────────────────────────────────────
      const extintoresComMotorista = (extintoresData || []).map((v) => {
        const motoristaAtivo = (v.motorista_viaturas as any[])?.find((mv) => mv.status === 'ativo');
        return {
          id: v.id,
          extintor_validade: v.extintor_validade,
          matricula: v.matricula,
          motorista_nome: motoristaAtivo?.motoristas_ativos?.nome || 'Livre',
        };
      });
      setExtintoresAPrazo(extintoresComMotorista);

      // ── Contratos a renovar/expirados — tabela contratos ───────────────
      // Renovação = data_inicio + duracao_meses meses; alerta 60 dias antes.
      if (contratosErr) {
        console.error('Erro ao carregar contratos:', contratosErr);
      }

      const hojeSemHora = new Date();
      hojeSemHora.setHours(0, 0, 0, 0);

      const allContratos = (contratosAtivos || []).map((ct: any) => {
        const fim = ct.data_fim
          ? new Date(ct.data_fim + 'T00:00:00')
          : addMonths(new Date(ct.data_inicio + 'T00:00:00'), ct.duracao_meses ?? 12);
        const diffDays = Math.ceil((fim.getTime() - hojeSemHora.getTime()) / (1000 * 60 * 60 * 24));
        return { ...ct, _renovacao: fim, _diffDays: diffDays };
      });

      // De-duplicar contratos repetidos: a mesma prestação aparece por vezes
      // 2x na BD — chave motorista+viatura+início, mantém-se o mais recente.
      const contratosUnicos = Array.from(
        allContratos
          .reduce((map: Map<string, any>, ct: any) => {
            const key = `${ct.motorista_id ?? ''}|${ct.viatura_id ?? ''}|${ct.data_inicio ?? ''}`;
            const existente = map.get(key);
            if (!existente || (ct.numero_contrato ?? 0) > (existente.numero_contrato ?? 0)) {
              map.set(key, ct);
            }
            return map;
          }, new Map<string, any>())
          .values()
      );

      const contratosRenovar = contratosUnicos
        .filter((ct: any) => ct._diffDays >= 0 && ct._diffDays <= 60)
        .sort((a: any, b: any) => a._renovacao.getTime() - b._renovacao.getTime());
      const expirados = contratosUnicos
        .filter((ct: any) => ct._diffDays < 0)
        .sort((a: any, b: any) => a._renovacao.getTime() - b._renovacao.getTime());

      setContratosAPrazo(contratosRenovar);
      setContratosExpirados(expirados);
      setCandidaturasPendentes(pendentes || 0);

      // ── Atividade & receita contratada do período — alimenta o gráfico
      // "Atividade" e a sua legenda.
      const eventosComRenda: EventoAtividade[] = (eventosMesData || []).map((ev) => {
        const matNorm = normalizarMatricula(ev.titulo);
        const vMatch = (viaturas || []).find((v) => normalizarMatricula(v.matricula) === matNorm);
        return {
          tipo: ev.tipo,
          data_inicio: ev.data_inicio,
          valor_aluguer: Number(vMatch?.valor_aluguer || 0),
        };
      });
      setEventosAtividade(eventosComRenda);
      setInicioRef(range.from);
      setFimRef(range.to);

      setReceitaContratadaPeriodo(
        eventosComRenda.filter((e) => e.tipo === 'entrega').reduce((s, e) => s + e.valor_aluguer, 0)
      );
    } catch (error: unknown) {
      console.error('Erro ao carregar dashboard:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar a homepage.',
        variant: 'destructive',
      });
    } finally {
      jaCarregou.current = true;
      setLoading(false);
      setAtualizando(false);
    }
  }, [toast, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const ocupacaoPct =
    fleet.total > 0 ? Math.round(((fleet.alugadas + fleet.reservadas) / fleet.total) * 100) : 0;
  const reservadasPct = fleet.total > 0 ? Math.round((fleet.reservadas / fleet.total) * 100) : 0;
  const oficinaPct = fleet.total > 0 ? Math.round((fleet.oficina / fleet.total) * 100) : 0;

  const totalAlugadosPeriodo = eventosAtividade.filter((e) => e.tipo === 'entrega').length;
  const totalDevolvidosPeriodo = eventosAtividade.filter(
    (e) => e.tipo === 'devolucao' || e.tipo === 'recolha'
  ).length;
  // Deriva-se do intervalo já aplicado (não do `range` seleccionado) para
  // acompanhar os eventos em memória — durante um fetch são ainda os antigos.
  const granularidade = useMemo(
    () => granularidadePara({ from: inicioRef, to: fimRef }),
    [inicioRef, fimRef]
  );
  const pontosGrafico = useMemo(
    () => buildChartPoints(eventosAtividade, inicioRef, fimRef, granularidade),
    [eventosAtividade, inicioRef, fimRef, granularidade]
  );
  // Sparkline da Alugadas é sempre semanal, independente da granularidade
  // escolhida no gráfico principal — é só um mini-contexto, não o gráfico.
  const pontosSemanais = useMemo(
    () => buildChartPoints(eventosAtividade, inicioRef, fimRef, 'semana'),
    [eventosAtividade, inicioRef, fimRef]
  );
  const sparkAlugadas = pontosSemanais.slice(-6).map((p) => p.alugados);

  const periodoLabel =
    preset === 'personalizado'
      ? `${format(range.from, 'dd MMM', { locale: pt })} – ${format(range.to, 'dd MMM yyyy', { locale: pt })}`
      : PRESET_LABELS[preset];

  const disponiveisAnim = useCountUp(fleet.disponiveis);
  const alugadasAnim = useCountUp(fleet.alugadas);
  const reservadasAnim = useCountUp(fleet.reservadas);
  const oficinaAnim = useCountUp(fleet.oficina);
  const ocupacaoAnim = useCountUp(ocupacaoPct);

  // ── Precisa da tua atenção — categorizado por tipo, não por severidade
  // fundida. No máximo 4 categorias — nunca uma lista longa. ────────────────

  const categoriasAlerta: CategoriaAlerta[] = useMemo(() => {
    const categorias: CategoriaAlerta[] = [];

    const totalContratos = contratosExpirados.length + contratosAPrazo.length;
    if (totalContratos > 0) {
      const pior = contratosExpirados[0] ?? contratosAPrazo[0];
      const codigo =
        pior.numero_contrato != null
          ? `CT-${String(pior.numero_contrato).padStart(4, '0')}`
          : pior.motorista_nome;
      const linha = contratosExpirados.includes(pior)
        ? `${codigo} expirou há ${Math.abs(pior._diffDays)} dia${Math.abs(pior._diffDays) !== 1 ? 's' : ''}`
        : `${codigo} renova em ${format(pior._renovacao, 'dd MMM', { locale: pt })}`;
      categorias.push({
        id: 'contratos',
        icon: FileText,
        cor: contratosExpirados.length > 0 ? 'destructive' : 'warning',
        titulo: 'Contratos',
        descricao: totalContratos > 1 ? `${linha} e mais ${totalContratos - 1}` : linha,
        href: totalContratos === 1 ? `/renting/contratos/${pior.id}` : '/renting/contratos',
      });
    }

    if (extintoresAPrazo.length > 0) {
      const algumExpirado = extintoresAPrazo.some(
        (e) => new Date(e.extintor_validade).getTime() < Date.now()
      );
      categorias.push({
        id: 'seguranca',
        icon: ShieldAlert,
        cor: algumExpirado ? 'destructive' : 'warning',
        titulo: 'Segurança',
        descricao: `${extintoresAPrazo.length} extintor${extintoresAPrazo.length !== 1 ? 'es' : ''} ${
          algumExpirado ? 'expirado(s)' : 'a expirar esta semana'
        }`,
        href: extintoresAPrazo.length === 1 ? `/viaturas/${extintoresAPrazo[0].id}` : '/viaturas',
      });
    }

    if (isExecutivo && (contasAReceber?.emAberto?.length ?? 0) > 0) {
      const emAberto = contasAReceber!.emAberto;
      const total = emAberto.reduce((s, c) => s + c.saldo, 0);
      const algumCritico = emAberto.some((c) => c.diasEmAberto > 60);
      categorias.push({
        id: 'cobrancas',
        icon: Wallet,
        cor: algumCritico ? 'destructive' : 'warning',
        titulo: 'Cobranças',
        descricao: `${formatCurrency(total)} há mais de 30 dias`,
        href: '/administrativo/faturacao',
      });
    }

    if (candidaturasPendentes > 0) {
      categorias.push({
        id: 'motoristas',
        icon: UserPlus,
        cor: 'warning',
        titulo: 'Motoristas',
        descricao: `${candidaturasPendentes} candidatura${candidaturasPendentes !== 1 ? 's' : ''} aguarda${candidaturasPendentes !== 1 ? 'm' : ''} aprovação`,
        href: '/motoristas/candidaturas',
      });
    }

    return categorias;
  }, [
    contratosExpirados,
    contratosAPrazo,
    extintoresAPrazo,
    contasAReceber,
    isExecutivo,
    candidaturasPendentes,
  ]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <StickyPageHeader title="Início" icon={LayoutDashboard}>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchData}
          disabled={atualizando}
          title="Atualizar"
        >
          <RefreshCw className={cn('h-4 w-4', atualizando && 'animate-spin')} />
        </Button>
        <ThemeToggle />
      </StickyPageHeader>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5">
            {/* ── Coluna esquerda: KPIs finos + gráfico protagonista ────── */}
            <div>
              <div className="flex flex-wrap border-b border-border pb-1 mb-3">
                <KpiItem
                  icon={CircleCheck}
                  cor="success"
                  label="Disponíveis"
                  valor={disponiveisAnim}
                  onClick={() => navigate('/viaturas?status=disponivel')}
                  index={0}
                >
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    de <b className="text-foreground font-semibold">{fleet.total}</b> viaturas
                  </p>
                </KpiItem>
                <KpiItem
                  icon={Car}
                  cor="blue"
                  label="Alugadas"
                  valor={alugadasAnim}
                  onClick={() => navigate('/viaturas?status=alugadas')}
                  index={1}
                >
                  <KpiSparkline values={sparkAlugadas} corClass="bg-blue-400" />
                </KpiItem>
                <KpiItem
                  icon={CalendarClock}
                  cor="violet"
                  label="Reservadas"
                  valor={reservadasAnim}
                  onClick={() => navigate('/viaturas?status=em_reserva')}
                  index={2}
                >
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    <b className="text-foreground font-semibold">{reservadasPct}%</b> da frota
                  </p>
                </KpiItem>
                <KpiItem
                  icon={Wrench}
                  cor="orange"
                  label="Em Oficina"
                  valor={oficinaAnim}
                  onClick={() => navigate('/viaturas?status=manutencao')}
                  index={3}
                >
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    <b className="text-foreground font-semibold">{oficinaPct}%</b> da frota
                  </p>
                </KpiItem>
                <KpiItem
                  icon={TrendingUp}
                  cor="blue"
                  label="Ocupação"
                  valor={`${ocupacaoAnim}%`}
                  onClick={() => navigate('/viaturas?status=em_uso')}
                  index={4}
                >
                  <KpiBar pct={ocupacaoPct} corClass="bg-blue-400" />
                </KpiItem>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-4 mb-1">
                    <div>
                      <h2 className="text-sm font-semibold">Atividade</h2>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {isExecutivo && (
                          <LegendChip corClass="bg-primary">
                            Receita <b>{formatCurrency(receitaContratadaPeriodo)}</b>
                          </LegendChip>
                        )}
                        <LegendChip corClass="bg-blue-400">
                          Alugados <b>{totalAlugadosPeriodo}</b>
                        </LegendChip>
                        <LegendChip corClass="bg-success">
                          Devolvidos <b>{totalDevolvidosPeriodo}</b>
                        </LegendChip>
                      </div>
                    </div>
                    {/* Único controlo do gráfico: o período. Vive no card, e
                        não no cabeçalho da página, porque só filtra este
                        gráfico — a frota e os alertas são sempre do momento
                        actual. */}
                    <Popover open={customRangeOpen} onOpenChange={setCustomRangeOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
                          {periodoLabel}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <div className="flex flex-col p-2 gap-0.5">
                          {(Object.keys(PRESET_LABELS) as FixedPreset[]).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => handlePreset(p)}
                              className={cn(
                                'rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                                preset === p
                                  ? 'bg-primary/10 font-semibold text-primary'
                                  : 'hover:bg-muted'
                              )}
                            >
                              {PRESET_LABELS[p]}
                            </button>
                          ))}
                        </div>
                        <div className="border-t border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Intervalo personalizado
                        </div>
                        <Calendar
                          mode="range"
                          selected={customRangeDraft}
                          onSelect={handleCustomRangeSelect}
                          numberOfMonths={2}
                          defaultMonth={range.from}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  {/* Enquanto o período novo carrega mantém-se o gráfico
                      anterior, só esbatido — trocá-lo por um skeleton fazia a
                      altura do card saltar a cada escolha. */}
                  <div
                    className={cn('transition-opacity duration-200', atualizando && 'opacity-40')}
                  >
                    <Suspense fallback={<Skeleton className="h-[190px] w-full mt-3" />}>
                      <ReceitaChart
                        data={pontosGrafico}
                        formatCurrency={formatCurrency}
                        granularidade={granularidade}
                        mostrarReceita={isExecutivo}
                      />
                    </Suspense>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-4">
                  <h2 className="text-sm font-semibold mb-1">Estado da Frota</h2>
                  <Suspense fallback={<Skeleton className="h-[168px] w-full mt-3" />}>
                    <FrotaDonutChart
                      disponiveis={frotaDonut.disponiveis}
                      ocupados={frotaDonut.ocupados}
                      inativos={frotaDonut.inativos}
                    />
                  </Suspense>
                </div>
              </div>
            </div>

            {/* ── Coluna direita: "Precisa de atenção" ocupa toda a altura,
                em vez de dividir espaço com outras secções. ─────────────── */}
            <div className="rounded-2xl border border-border bg-card p-4 h-full">
              <h2 className="text-[12.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Precisa de atenção
              </h2>
              {categoriasAlerta.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success/5 px-4 py-3.5">
                  <CircleCheck className="h-5 w-5 text-success shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-success">Tudo em ordem</p>
                    <p className="text-xs text-muted-foreground">
                      Nada precisa da tua atenção hoje.
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  {categoriasAlerta.map((categoria, i) => (
                    <AlertaCategoriaRow
                      key={categoria.id}
                      categoria={categoria}
                      index={i}
                      onClick={() => navigate(categoria.href)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Histórico de check-in/check-out + mapa Car Track (posições reais). ─ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <CheckinCheckoutHistoricoCard enabled />
            <CartrackMapCard />
          </div>
        </>
      )}
    </div>
  );
};

// ── KPI strip — sem caixa em repouso; o chrome (fundo, sombra, risca de
// cor) só aparece no hover, para parecer atalho e não display estático. ────

const KPI_CORES: Record<string, { icon: string; iconBgHover: string; underline: string }> = {
  success: {
    icon: 'text-success',
    iconBgHover: 'group-hover:bg-success/15',
    underline: 'bg-success',
  },
  blue: {
    icon: 'text-blue-400',
    iconBgHover: 'group-hover:bg-blue-500/15',
    underline: 'bg-blue-400',
  },
  violet: {
    icon: 'text-violet-400',
    iconBgHover: 'group-hover:bg-violet-500/15',
    underline: 'bg-violet-400',
  },
  orange: {
    icon: 'text-orange-400',
    iconBgHover: 'group-hover:bg-orange-500/15',
    underline: 'bg-orange-400',
  },
};

function KpiItem({
  icon: Icon,
  cor,
  label,
  valor,
  onClick,
  index,
  children,
}: {
  icon: typeof Car;
  cor: keyof typeof KPI_CORES;
  label: string;
  valor: number | string;
  onClick: () => void;
  index: number;
  children?: React.ReactNode;
}) {
  const c = KPI_CORES[cor];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 50}ms` }}
      className="group relative flex-1 min-w-[135px] text-left px-4 pt-2.5 pb-3 rounded-xl cursor-pointer animate-in fade-in slide-in-from-bottom-1 duration-500 fill-mode-backwards transition-all hover:bg-background hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 dark:hover:shadow-black/30"
    >
      <span className="flex items-center gap-1.5 mb-1.5">
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-md transition-colors',
            c.icon,
            c.iconBgHover
          )}
        >
          <Icon className="h-3 w-3" />
        </span>
        <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      </span>
      <span className="block text-[26px] font-bold tabular-nums leading-none tracking-tight">
        {valor}
      </span>
      {children}
      <span
        className={cn(
          'absolute left-4 right-4 bottom-1.5 h-[2px] rounded-full opacity-0 scale-x-[0.4] origin-left transition-all duration-200 group-hover:opacity-100 group-hover:scale-x-100',
          c.underline
        )}
      />
    </button>
  );
}

function KpiBar({ pct, corClass }: { pct: number; corClass: string }) {
  return (
    <span className="block h-[3px] w-full rounded-full bg-foreground/[0.07] overflow-hidden mt-2">
      <span
        className={cn(
          'block h-full rounded-full transition-[width] duration-700 ease-out',
          corClass
        )}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </span>
  );
}

function KpiSparkline({ values, corClass }: { values: number[]; corClass: string }) {
  const max = Math.max(1, ...values);
  return (
    <span className="flex items-end gap-[2px] h-4 mt-2">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn(
            'w-1 rounded-t-[1px]',
            corClass,
            i === values.length - 1 ? 'opacity-100' : 'opacity-45'
          )}
          style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
        />
      ))}
    </span>
  );
}

function LegendChip({ corClass, children }: { corClass: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', corClass)} />
      {children}
    </span>
  );
}

// ── Precisa de atenção — linha inteira clicável, sem botão nem caixa
// tintada em repouso; o hover é o único chrome. ─────────────────────────────

const CORES_ALERTA: Record<CorAlerta, { texto: string; fundo: string }> = {
  destructive: { texto: 'text-destructive', fundo: 'bg-destructive/10' },
  warning: { texto: 'text-warning', fundo: 'bg-warning/10' },
};

function AlertaCategoriaRow({
  categoria,
  onClick,
  index,
}: {
  categoria: CategoriaAlerta;
  onClick: () => void;
  index: number;
}) {
  const c = CORES_ALERTA[categoria.cor];
  const Icon = categoria.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${80 + index * 60}ms` }}
      className="w-full flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-lg text-left cursor-pointer animate-in fade-in slide-in-from-bottom-1 duration-500 fill-mode-backwards transition-colors hover:bg-muted/40"
    >
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg shrink-0',
          c.fundo,
          c.texto
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className={cn('block text-[11px] font-bold uppercase tracking-wide', c.texto)}>
          {categoria.titulo}
        </span>
        <span className="block text-[13px] font-medium mt-0.5">{categoria.descricao}</span>
      </span>
    </button>
  );
}

export default Dashboard;
