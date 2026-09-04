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
  CalendarRange,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { DashboardInicioHeader } from '@/components/dashboard/DashboardInicioHeader';
import { KpiItem, KpiBar, KpiSparkline } from '@/components/dashboard/KpiItem';
import { ChartMetric } from '@/components/dashboard/ChartMetric';
import {
  AlertaCategoriaRow,
  type CategoriaAlerta,
  type CorAlerta,
} from '@/components/dashboard/AlertaCategoriaRow';
import { useDashboardVariant } from '@/hooks/useDashboardVariant';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
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

export function DashboardFrota() {
  const { toast } = useToast();
  const navigate = useNavigate();
  // O botão de pedidos de informática e as suas permissões vivem agora em
  // DashboardInicioHeader, partilhado pelas três dashboards.
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
      const outros = totalContratos - 1;
      categorias.push({
        id: 'contratos',
        icon: FileText,
        cor: contratosExpirados.length > 0 ? 'destructive' : 'warning',
        titulo: 'Contratos',
        descricao: linha,
        detalhe:
          outros > 0
            ? `+${outros} outro${outros !== 1 ? 's' : ''} contrato${outros !== 1 ? 's' : ''}`
            : null,
        contagem: totalContratos,
        href: totalContratos === 1 ? `/renting/contratos/${pior.id}` : '/renting/contratos',
      });
    }

    if (extintoresAPrazo.length > 0) {
      // A lista vem ordenada por validade ascendente, logo [0] é o pior caso —
      // e é dele que fala a linha principal. O agregado desce para a segunda
      // linha: uma matrícula dá para agir, um número sozinho não dá.
      const pior = extintoresAPrazo[0];
      const validadePior = new Date(pior.extintor_validade);
      const piorExpirado = validadePior.getTime() < Date.now();
      const algumExpirado = extintoresAPrazo.some(
        (e) => new Date(e.extintor_validade).getTime() < Date.now()
      );
      const outros = extintoresAPrazo.length - 1;
      categorias.push({
        id: 'seguranca',
        icon: ShieldAlert,
        cor: algumExpirado ? 'destructive' : 'warning',
        titulo: 'Segurança',
        descricao: piorExpirado
          ? `${pior.matricula} — extintor expirado`
          : `${pior.matricula} — extintor expira ${format(validadePior, 'dd MMM', { locale: pt })}`,
        detalhe:
          outros > 0
            ? `+${outros} outra${outros !== 1 ? 's' : ''} viatura${outros !== 1 ? 's' : ''}`
            : null,
        contagem: extintoresAPrazo.length,
        href: extintoresAPrazo.length === 1 ? `/viaturas/${pior.id}` : '/viaturas',
      });
    }

    if (isExecutivo && (contasAReceber?.emAberto?.length ?? 0) > 0) {
      const emAberto = contasAReceber!.emAberto;
      const total = emAberto.reduce((s, c) => s + c.saldo, 0);
      const algumCritico = emAberto.some((c) => c.diasEmAberto > 60);
      // `emAberto` vem ordenado por dias em aberto (desc) — [0] é a mais antiga.
      const pior = emAberto[0];
      const outras = emAberto.length - 1;
      categorias.push({
        id: 'cobrancas',
        icon: Wallet,
        cor: algumCritico ? 'destructive' : 'warning',
        titulo: 'Cobranças',
        descricao: `${pior.destinatarioNome} · ${formatCurrency(pior.saldo)} há ${pior.diasEmAberto} dias`,
        detalhe:
          outras > 0
            ? `+${outras} outra${outras !== 1 ? 's' : ''} · ${formatCurrency(total)} em aberto`
            : null,
        contagem: emAberto.length,
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
        detalhe: null,
        contagem: candidaturasPendentes,
        href: '/motoristas/candidaturas',
      });
    }

    // O que já falhou (destructive) antes do que ainda está a prazo (warning).
    // Antes a ordem era a de construção — o tipo de alerta —, o que punha um
    // contrato a renovar daqui a 50 dias acima de faturas críticas.
    // `sort` é estável, por isso dentro do mesmo nível a ordem por tipo mantém-se.
    return categorias.sort((a, b) => (a.cor === b.cor ? 0 : a.cor === 'destructive' ? -1 : 1));
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
    <div className="space-y-3">
      {/* O cabeçalho aperta-se aqui (e só aqui): a homepage é a única
          página desenhada para caber num ecrã sem scroll. */}
      <DashboardInicioHeader
        onAtualizar={fetchData}
        atualizando={atualizando}
        className="lg:pb-4 lg:mb-4"
      />

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
            {/* ── Coluna esquerda: KPIs finos + gráfico protagonista ────── */}
            <div className="space-y-4">
              {/* Faixa de KPIs: divisores hairline, sem caixa por indicador.
                  Têm de se ler como UMA secção da página e não como cinco
                  cartões soltos.
                  Grelha e não flex-wrap: em flex-wrap, a 1280px (onde a coluna
                  esquerda encolhe para ~580px) o quinto KPI caía para uma
                  segunda linha e a faixa partia-se ao meio. A grelha fixa as
                  colunas por breakpoint e os divisores só existem no lg+, onde
                  há garantidamente uma única linha. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border-b border-border">
                <KpiItem
                  icon={CircleCheck}
                  cor="success"
                  label="Disponíveis"
                  valor={disponiveisAnim}
                  onClick={() => navigate('/viaturas?status=disponivel')}
                  index={0}
                >
                  <span className="text-[11px] text-muted-foreground">
                    de <b className="font-semibold text-foreground tabular-nums">{fleet.total}</b>{' '}
                    viaturas
                  </span>
                </KpiItem>
                <KpiItem
                  icon={Car}
                  cor="navy"
                  label="Alugadas"
                  valor={alugadasAnim}
                  onClick={() => navigate('/viaturas?status=alugadas')}
                  index={1}
                >
                  <KpiSparkline values={sparkAlugadas} corClass="bg-brand-navy" />
                </KpiItem>
                <KpiItem
                  icon={CalendarClock}
                  cor="violet"
                  label="Reservadas"
                  valor={reservadasAnim}
                  onClick={() => navigate('/viaturas?status=em_reserva')}
                  index={2}
                >
                  <span className="text-[11px] text-muted-foreground">
                    <b className="font-semibold text-foreground tabular-nums">{reservadasPct}%</b>{' '}
                    da frota
                  </span>
                </KpiItem>
                <KpiItem
                  icon={Wrench}
                  cor="warning"
                  label="Em Oficina"
                  valor={oficinaAnim}
                  onClick={() => navigate('/viaturas?status=manutencao')}
                  index={3}
                >
                  <span className="text-[11px] text-muted-foreground">
                    <b className="font-semibold text-foreground tabular-nums">{oficinaPct}%</b> da
                    frota
                  </span>
                </KpiItem>
                <KpiItem
                  icon={TrendingUp}
                  cor="navy"
                  label="Ocupação"
                  valor={`${ocupacaoAnim}%`}
                  onClick={() => navigate('/viaturas?status=em_uso')}
                  index={4}
                >
                  <KpiBar pct={ocupacaoPct} corClass="bg-brand-navy" />
                </KpiItem>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_15rem] gap-4">
                <Card className="rounded-xl shadow-none p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold">Atividade</h2>
                      {/* Legenda e totais na mesma linha. Antes havia estes
                          rótulos aqui E um Legend do recharts por cima do
                          gráfico, com os mesmos três nomes — a legenda estava
                          desenhada duas vezes. */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                        {isExecutivo && (
                          <ChartMetric
                            corClass="bg-primary"
                            label="Receita"
                            valor={formatCurrency(receitaContratadaPeriodo)}
                          />
                        )}
                        <ChartMetric
                          corClass="bg-brand-navy"
                          label="Alugados"
                          valor={totalAlugadosPeriodo}
                        />
                        <ChartMetric
                          corClass="bg-success"
                          label="Devolvidos"
                          valor={totalDevolvidosPeriodo}
                        />
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
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <CalendarRange className="h-3.5 w-3.5" />
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
                                'rounded-md px-3 py-1.5 text-left text-sm transition-colors duration-150',
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
                    className={cn(
                      'mt-3 transition-opacity duration-200',
                      atualizando && 'opacity-40'
                    )}
                  >
                    <Suspense fallback={<Skeleton className="h-[190px] w-full" />}>
                      <ReceitaChart
                        data={pontosGrafico}
                        formatCurrency={formatCurrency}
                        granularidade={granularidade}
                        mostrarReceita={isExecutivo}
                      />
                    </Suspense>
                  </div>
                </Card>

                <Card className="rounded-xl shadow-none p-4">
                  <h2 className="text-sm font-semibold">Estado da Frota</h2>
                  <Suspense fallback={<Skeleton className="h-[168px] w-full mt-3" />}>
                    <FrotaDonutChart
                      disponiveis={frotaDonut.disponiveis}
                      ocupados={frotaDonut.ocupados}
                      inativos={frotaDonut.inativos}
                    />
                  </Suspense>
                </Card>
              </div>
            </div>

            {/* ── Coluna direita: "Precisa de atenção" ───────────────────── */}
            {/* O cartão acompanha a altura da coluna esquerda (é o que a
                grelha faz por omissão) e as linhas crescem para ocupar o que
                sobra, até um tecto. Sem isto ficava ou um cartão a meia altura
                a flutuar, ou um cartão inteiro com dois terços vazios em baixo:
                o espaço distribui-se pelas linhas em vez de se juntar todo no
                fim. */}
            <Card className="flex flex-col rounded-xl shadow-none p-4">
              <h2 className="text-sm font-semibold">Precisa de atenção</h2>
              {categoriasAlerta.length === 0 ? (
                <div className="my-auto flex items-center gap-3 rounded-lg border border-success/25 bg-success/5 px-3 py-3">
                  <CircleCheck className="h-5 w-5 shrink-0 text-success" />
                  <div>
                    <p className="text-sm font-semibold text-success">Tudo em ordem</p>
                    <p className="text-xs text-muted-foreground">
                      Nada precisa da tua atenção hoje.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="-mx-2 mt-1 flex flex-1 flex-col justify-center divide-y divide-border/60">
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
            </Card>
          </div>

          {/* ── Histórico de check-in/check-out + mapa Car Track (posições reais). ─ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CheckinCheckoutHistoricoCard enabled />
            <CartrackMapCard />
          </div>
        </>
      )}
    </div>
  );
}

// ── Faixa de KPIs — sem caixa por indicador: em repouso o único chrome é o
// divisor hairline à esquerda; o fundo e a risca de cor só aparecem no hover,
// para o item parecer atalho e não display estático. ─────────────────────────


