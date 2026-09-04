import { useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  CircleDollarSign,
  Wallet,
  FileText,
  Banknote,
  CalendarClock,
  CalendarRange,
  CreditCard,
  Users,
  Wifi,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardInicioHeader } from '@/components/dashboard/DashboardInicioHeader';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { KpiItem } from '@/components/dashboard/KpiItem';
import { AlertaCategoriaRow, type CategoriaAlerta } from '@/components/dashboard/AlertaCategoriaRow';
import { ChartMetric } from '@/components/dashboard/ChartMetric';
import { useResumoPlataformas, type ResumoPlataforma } from '@/hooks/useResumoPlataformas';
import { useFaturacaoResumoPeriodo } from '@/hooks/useFaturacaoResumoPeriodo';
import { useContasAReceber } from '@/hooks/useContasAReceber';
import { useContratosARenovar } from '@/hooks/useContratosARenovar';
import { useUltimaSemanaFechada } from '@/hooks/useUltimaSemanaFechada';
import { useContasResumoSemana } from '@/hooks/useContasResumoSemana';
import { useFaturacaoMovimentos } from '@/hooks/useFaturacaoMovimentos';
import { useCartoesObeResumo } from '@/hooks/useCartoesObeResumo';
import { useRecibosVerdesResumo } from '@/hooks/useRecibosVerdesResumo';

const FaturacaoChart = lazy(() => import('./FaturacaoChart'));
const RecibosDonutChart = lazy(() => import('./RecibosDonutChart'));

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

const PLATAFORMA_LOGO: Record<string, string> = {
  Bolt: '/images/logo-bolt.png',
  Uber: '/images/logo-uber.png',
  BP: '/images/logo-bp.png',
  Repsol: '/images/logo-repsol.png',
  EDP: '/images/logo-edp.png',
  'Via Verde': '/images/logo-via-verde.png',
};

const PLATAFORMA_SUB: Record<string, string> = {
  Bolt: 'Faturado',
  Uber: 'Faturado',
  BP: 'Combustível',
  Repsol: 'Combustível',
  EDP: 'Energia',
  'Via Verde': 'Portagens',
};

function somaReceita(dados: ResumoPlataforma[]): number {
  return dados.filter((p) => p.tipo_valor === 'receita').reduce((s, p) => s + p.valor, 0);
}

export function DashboardFinanceiro() {
  const navigate = useNavigate();
  // Calculado uma vez: `new Date()` a cada render dava instantes sempre novos,
  // e um hook que dependesse deles voltava a pedir os dados em ciclo.
  const { hoje, semana, mes } = useMemo(() => {
    const agora = new Date();
    return {
      hoje: startOfDay(agora),
      semana: {
        inicio: startOfWeek(agora, { weekStartsOn: 1 }),
        fim: endOfWeek(agora, { weekStartsOn: 1 }),
      },
      mes: { inicio: startOfMonth(agora), fim: endOfMonth(agora) },
    };
  }, []);

  const { dados: dadosHoje, loading: loadingHoje } = useResumoPlataformas(hoje, hoje);
  const { dados: dadosSemana, loading: loadingSemana } = useResumoPlataformas(semana.inicio, semana.fim);
  const { dados: dadosMes, loading: loadingMes } = useResumoPlataformas(mes.inicio, mes.fim);
  const { resumo: faturacao, loading: loadingFaturacao } = useFaturacaoResumoPeriodo(mes.inicio, mes.fim);
  const { data: contasAReceber } = useContasAReceber();
  const { contratos: contratosARenovar } = useContratosARenovar();
  // Contas de motoristas: os mesmos numeros do separador Administrativo >
  // Resumos, pelo mesmo calculo (useContasResumoSemana). Só existem para
  // semanas ja fechadas, por isso mostra-se a ultima fechada e diz-se qual e.
  const { semana: semanaFechada } = useUltimaSemanaFechada();
  const { resumos: contasMotoristas } = useContasResumoSemana(
    semanaFechada?.inicio ?? mes.inicio,
    semanaFechada?.fim ?? mes.fim,
    semanaFechada ? true : null
  );
  const topMotoristas = contasMotoristas.slice(0, 5);
  const faturado = useFaturacaoMovimentos(mes.inicio, mes.fim, semana.inicio, semana.fim);
  const { resumo: cartoesObe } = useCartoesObeResumo();
  const { resumo: recibos } = useRecibosVerdesResumo();

  const loading = loadingHoje || loadingSemana || loadingMes || loadingFaturacao || faturado.loading;
  const semanaLabel = `${format(semana.inicio, 'd MMM', { locale: pt })} – ${format(semana.fim, 'd MMM', { locale: pt })}`;

  const cobrancas = contasAReceber?.emAberto ?? [];
  const totalEmAberto = cobrancas.reduce((s, c) => s + c.saldo, 0);

  // Mesma leitura da dashboard de frota: cada categoria mostra o caso mais
  // grave, e a segunda linha diz quantos mais existem.
  const categoriasAlerta: CategoriaAlerta[] = [];
  if (cobrancas.length > 0) {
    const pior = cobrancas[0];
    categoriasAlerta.push({
      id: 'cobrancas',
      icon: Wallet,
      cor: 'destructive',
      titulo: 'Cobranças',
      descricao: `${pior.destinatarioNome} · ${fmtEur(pior.saldo)} há ${pior.diasEmAberto} dias`,
      detalhe:
        cobrancas.length > 1
          ? `+${cobrancas.length - 1} outras · ${fmtEur(totalEmAberto)} em aberto`
          : null,
      contagem: cobrancas.length,
      href: '/administrativo/faturacao',
    });
  }
  if (faturacao.pendentes.count > 0) {
    categoriasAlerta.push({
      id: 'recibos',
      icon: FileText,
      cor: 'warning',
      titulo: 'Recibos',
      descricao: `${faturacao.pendentes.count} por emitir · ${fmtEur(faturacao.pendentes.valor)}`,
      detalhe: null,
      contagem: faturacao.pendentes.count,
      href: '/administrativo/faturacao',
    });
  }
  if (contratosARenovar.length > 0) {
    const proximo = contratosARenovar[0];
    categoriasAlerta.push({
      id: 'contratos',
      icon: CalendarClock,
      cor: 'warning',
      titulo: 'Contratos',
      descricao: `Contrato #${proximo.numero_contrato}${proximo.matricula ? ` — ${proximo.matricula}` : ''} renova em ${proximo.diasParaRenovar} dias`,
      detalhe: contratosARenovar.length > 1 ? `+${contratosARenovar.length - 1} outros contratos` : null,
      contagem: contratosARenovar.length,
      href: '/renting/contratos',
    });
  }

  return (
    <div className="p-4 md:p-6">
      <DashboardInicioHeader perfil="Financeiro" className="lg:pb-4 lg:mb-4" />

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
          {/* ── Coluna esquerda: faixa de KPIs + plataformas + motoristas ── */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border-b border-border">
              <KpiItem
                icon={CircleDollarSign}
                cor="success"
                label="Faturado hoje"
                valor={fmtEur(faturado.hoje.valor)}
                onClick={() => navigate('/administrativo')}
                index={0}
              >
                <span className="text-[11px] text-muted-foreground">
                  <b className="font-semibold text-foreground tabular-nums">{faturado.hoje.count}</b>{' '}
                  facturas
                </span>
              </KpiItem>
              <KpiItem
                icon={Wallet}
                cor="navy"
                label="Esta semana"
                valor={fmtEur(faturado.semana.valor)}
                onClick={() => navigate('/administrativo')}
                index={1}
              >
                <span className="text-[11px] text-muted-foreground">{semanaLabel}</span>
              </KpiItem>
              <KpiItem
                icon={FileText}
                cor="warning"
                label="Por emitir"
                valor={fmtEur(faturacao.pendentes.valor)}
                onClick={() => navigate('/administrativo/faturacao')}
                index={2}
              >
                <span className="text-[11px] text-muted-foreground">
                  <b className="font-semibold text-foreground tabular-nums">
                    {faturacao.pendentes.count}
                  </b>{' '}
                  recibos
                </span>
              </KpiItem>
              <KpiItem
                icon={CalendarClock}
                cor="destructive"
                label="Em atraso"
                valor={fmtEur(faturacao.emAtraso.valor)}
                onClick={() => navigate('/administrativo/faturacao')}
                index={3}
              >
                <span className="text-[11px] text-muted-foreground">
                  <b className="font-semibold text-foreground tabular-nums">
                    {faturacao.emAtraso.count}
                  </b>{' '}
                  facturas
                </span>
              </KpiItem>
              <KpiItem
                icon={Banknote}
                cor="violet"
                label="Líquido este mês"
                valor={fmtEur(somaReceita(dadosMes))}
                onClick={() => navigate('/administrativo')}
                index={4}
              >
                <span className="text-[11px] text-muted-foreground">
                  {format(mes.inicio, 'MMMM', { locale: pt })}
                </span>
              </KpiItem>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_15rem] gap-4">
              <Card className="rounded-xl shadow-none p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">Faturação</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <ChartMetric
                        corClass="bg-primary"
                        label="Faturado"
                        valor={fmtEur(faturado.mes.valor)}
                      />
                      <ChartMetric
                        corClass="bg-brand-navy"
                        label="Facturas"
                        valor={faturado.mes.count}
                      />
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    <CalendarRange className="h-3.5 w-3.5" />
                    {format(mes.inicio, 'MMMM', { locale: pt })}
                  </span>
                </div>
                <div className="mt-3">
                  <Suspense fallback={<Skeleton className="h-[200px] w-full" />}>
                    <FaturacaoChart data={faturado.serie} formatCurrency={fmtEur} />
                  </Suspense>
                </div>
              </Card>

              <Card className="rounded-xl shadow-none p-4">
                <h2 className="text-sm font-semibold">Recibos por Estado</h2>
                <div className="mt-2">
                  <Suspense fallback={<Skeleton className="h-[150px] w-full" />}>
                    <RecibosDonutChart
                      validados={recibos.validados}
                      pendentes={recibos.pendentes}
                      recusados={recibos.recusados}
                    />
                  </Suspense>
                </div>
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-success" />
                      Validados
                    </span>
                    <span className="font-semibold tabular-nums">{recibos.validados}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-warning" />
                      Pendentes
                    </span>
                    <span className="font-semibold tabular-nums">{recibos.pendentes}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                      Recusados
                    </span>
                    <span className="font-semibold tabular-nums">{recibos.recusados}</span>
                  </div>
                </div>
              </Card>
            </div>

            <Card className="p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold">Plataformas e fornecedores</h2>
                <span className="text-[11px] text-muted-foreground">importações de {semanaLabel}</span>
              </div>
              <div className="divide-y divide-border/60">
                {dadosSemana.map((p) => (
                  <div key={p.plataforma} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/60 p-1">
                        <img
                          src={PLATAFORMA_LOGO[p.plataforma]}
                          alt={p.plataforma}
                          className="h-full w-full object-contain"
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">{p.plataforma}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {PLATAFORMA_SUB[p.plataforma] ?? '—'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={
                          p.tipo_valor === 'receita'
                            ? 'text-[15px] font-semibold tabular-nums text-success'
                            : 'text-[15px] font-semibold tabular-nums text-destructive'
                        }
                      >
                        {fmtEur(p.valor)}
                      </div>
                      {p.valor_bruto !== null && p.comissao !== null && (
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          {fmtEur(p.valor_bruto)} brutos · {fmtEur(p.comissao)} comissão
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-primary" />
                  Contas de motoristas
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {semanaFechada
                    ? `semana fechada · ${format(semanaFechada.inicio, 'd MMM', { locale: pt })} – ${format(semanaFechada.fim, 'd MMM', { locale: pt })}`
                    : 'sem semanas fechadas'}
                </span>
              </div>
              {topMotoristas.length === 0 ? (
                <p className="py-2 text-[13px] text-muted-foreground">
                  {semanaFechada
                    ? 'Sem contas nesta semana.'
                    : 'Ainda nao ha nenhuma semana fechada.'}
                </p>
              ) : (
                <div className="divide-y divide-border/60">
                  <div className="grid grid-cols-[1fr_repeat(4,auto)] gap-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Motorista</span>
                    <span className="text-right">Faturado</span>
                    <span className="text-right">Aluguer</span>
                    <span className="text-right">Custos</span>
                    <span className="text-right">Líquido</span>
                  </div>
                  {topMotoristas.map((m) => (
                    <div
                      key={m._uid ?? m.driver_uuid}
                      className="grid grid-cols-[1fr_repeat(4,auto)] items-center gap-3 py-2 text-[13px]"
                    >
                      <span className="truncate font-medium">{m.driver_name}</span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {fmtEur(m.total_faturado)}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {fmtEur(m.aluguer)}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {fmtEur(m.combustivel + m.portagens + m.reparacoes)}
                      </span>
                      <span
                        className={
                          m.liquido < 0
                            ? 'text-right font-semibold tabular-nums text-destructive'
                            : 'text-right font-semibold tabular-nums text-success'
                        }
                      >
                        {fmtEur(m.liquido)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── Coluna direita: atenção + cartões/OBE ──────────────────────── */}
          <div className="space-y-4">
            <Card className="flex flex-col p-4">
            <h2 className="text-sm font-semibold">Precisa de atenção</h2>
            {categoriasAlerta.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">Nada a destacar por agora.</p>
            ) : (
              <div className="mt-1 flex flex-1 flex-col">
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

            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="h-4 w-4 text-primary" />
                Cartões Frota e OBE
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <button
                  type="button"
                  onClick={() => navigate('/administrativo/cartoes')}
                  className="rounded-lg border border-border/70 p-2 transition-colors hover:bg-muted/60"
                >
                  <div className="text-lg font-semibold tabular-nums">{cartoesObe.cartoes.total}</div>
                  <div className="text-[11px] text-muted-foreground">Cartões</div>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/administrativo/cartoes')}
                  className="rounded-lg border border-border/70 p-2 transition-colors hover:bg-muted/60"
                >
                  <div className="text-lg font-semibold tabular-nums text-success">
                    {cartoesObe.cartoes.emUso}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Em uso</div>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/administrativo/cartoes')}
                  className="rounded-lg border border-border/70 p-2 transition-colors hover:bg-muted/60"
                >
                  <div className="text-lg font-semibold tabular-nums">
                    {cartoesObe.cartoes.disponiveis}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Disponíveis</div>
                </button>
              </div>
              <button
                type="button"
                onClick={() => navigate('/administrativo/obe')}
                className="mt-2 flex w-full items-center gap-3 rounded-lg border border-border/70 p-2.5 text-left transition-colors hover:bg-muted/60"
              >
                <Wifi className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">Dispositivos OBE</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {cartoesObe.obe.ativos} ativos
                    {cartoesObe.obe.semViatura > 0 &&
                      ` · ${cartoesObe.obe.semViatura} sem viatura associada`}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                  {cartoesObe.obe.total}
                </span>
              </button>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
