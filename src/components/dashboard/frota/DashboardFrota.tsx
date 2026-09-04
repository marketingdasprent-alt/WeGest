import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import {
  CircleCheck,
  Car,
  CalendarClock,
  Wrench,
  TrendingUp,
  CalendarRange,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { startOfMonth, endOfDay } from 'date-fns';
import { DashboardInicioHeader } from '@/components/dashboard/DashboardInicioHeader';
import { KpiItem, KpiBar, KpiSparkline } from '@/components/dashboard/KpiItem';
import { ChartMetric } from '@/components/dashboard/ChartMetric';
import {
  PRESET_LABELS,
  getPeriodRange,
  labelDoPeriodo,
  type DateRange,
  type FixedPreset,
  type PeriodPreset,
} from '@/components/dashboard/periodo';
import {
  AlertaCategoriaRow,
  type CategoriaAlerta,
} from '@/components/dashboard/AlertaCategoriaRow';
import { useDashboardVariant } from '@/hooks/useDashboardVariant';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchViaturasOcupacao } from '@/hooks/useViaturasOcupacao';
import { useContagemAnimada } from '@/hooks/useContagemAnimada';
import {
  buildChartPoints,
  formatCurrency,
  granularidadePara,
  normalizarMatricula,
  type EventoAtividade,
} from './atividade';
import { construirAlertasFrota, classificarContratos } from './alertas';
import { fetchViaturasFrota, fetchAlertasFrota } from '@/hooks/dashboardFrotaQueries';
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
      const [viaturas, ocupacao] = await Promise.all([
        fetchViaturasFrota(),
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

      const { extintoresData, contratosAtivos, contratosErr, pendentes, eventosMesData } =
        await fetchAlertasFrota(extStrStr, range.from.toISOString(), range.to.toISOString());

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

      const { aPrazo, expirados } = classificarContratos(contratosAtivos);
      setContratosAPrazo(aPrazo);
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

  const periodoLabel = labelDoPeriodo(preset, range);

  const disponiveisAnim = useContagemAnimada(fleet.disponiveis);
  const alugadasAnim = useContagemAnimada(fleet.alugadas);
  const reservadasAnim = useContagemAnimada(fleet.reservadas);
  const oficinaAnim = useContagemAnimada(fleet.oficina);
  const ocupacaoAnim = useContagemAnimada(ocupacaoPct);

  // ── Precisa da tua atenção — categorizado por tipo, não por severidade
  // fundida. No máximo 4 categorias — nunca uma lista longa. ────────────────

  const categoriasAlerta: CategoriaAlerta[] = useMemo(
    () =>
      construirAlertasFrota({
        contratosExpirados,
        contratosAPrazo,
        extintoresAPrazo,
        contasAReceber,
        isExecutivo,
        candidaturasPendentes,
      }),
    [
      contratosExpirados,
      contratosAPrazo,
      extintoresAPrazo,
      contasAReceber,
      isExecutivo,
      candidaturasPendentes,
    ]
  );

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
