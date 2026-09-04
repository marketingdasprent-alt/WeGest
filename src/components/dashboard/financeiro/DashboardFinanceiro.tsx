import { useMemo, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  CircleDollarSign,
  Wallet,
  FileText,
  Banknote,
  CalendarClock,
  CreditCard,
  Wifi,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { PeriodoSelector } from '@/components/dashboard/PeriodoSelector';
import { ContasMotoristasCard } from './ContasMotoristasCard';
import { getPeriodRange, type DateRange, type PeriodPreset } from '@/components/dashboard/periodo';
import { DashboardInicioHeader } from '@/components/dashboard/DashboardInicioHeader';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { KpiItem } from '@/components/dashboard/KpiItem';
import {
  AlertaCategoriaRow,
  type CategoriaAlerta,
} from '@/components/dashboard/AlertaCategoriaRow';
import { ChartMetric } from '@/components/dashboard/ChartMetric';
import { useResumoPlataformas, type ResumoPlataforma } from '@/hooks/useResumoPlataformas';
import { useFaturacaoPendentes } from '@/hooks/useFaturacaoPendentes';
import { useContasAReceber, DIAS_EM_ABERTO_ALERTA } from '@/hooks/useContasAReceber';
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
  const { semana, mes } = useMemo(() => {
    const agora = new Date();
    return {
      semana: {
        inicio: startOfWeek(agora, { weekStartsOn: 1 }),
        fim: endOfWeek(agora, { weekStartsOn: 1 }),
      },
      mes: { inicio: startOfMonth(agora), fim: endOfMonth(agora) },
    };
  }, []);

  // Período do gráfico de faturação — o mesmo seletor da dashboard de frota, e
  // como lá só filtra este gráfico: os KPIs de hoje/semana e os alertas são
  // sempre do momento actual.
  const [preset, setPreset] = useState<PeriodPreset>('mes');
  const [range, setRange] = useState<DateRange>(() => getPeriodRange('mes'));

  // Contas de motoristas: os mesmos numeros do separador Administrativo >
  // Resumos, pelo mesmo calculo (useContasResumoSemana). Só existem para
  // semanas ja fechadas, por isso mostra-se a ultima fechada e diz-se qual e.
  const { semana: semanaFechada } = useUltimaSemanaFechada();
  // As plataformas seguem a MESMA semana fechada, e não a semana a decorrer.
  // Bolt e Uber são resumos semanais que só passam a existir depois de a
  // semana fechar: pedidos para a semana em curso davam sempre 0,00 €, e duas
  // das seis linhas do cartão liam-se como "não houve receita" quando o que
  // havia era "ainda não foi importado".
  const plataformasInicio = semanaFechada?.inicio ?? semana.inicio;
  const plataformasFim = semanaFechada?.fim ?? semana.fim;

  const { dados: dadosPlataformas, loading: loadingPlataformas } = useResumoPlataformas(
    plataformasInicio,
    plataformasFim
  );
  const { dados: dadosMes, loading: loadingMes } = useResumoPlataformas(mes.inicio, mes.fim);
  const { pendentes, loading: loadingPendentes } = useFaturacaoPendentes();
  const { data: contasAReceber } = useContasAReceber();
  const { contratos: contratosARenovar } = useContratosARenovar();
  const { resumos: contasMotoristas } = useContasResumoSemana(
    semanaFechada?.inicio ?? mes.inicio,
    semanaFechada?.fim ?? mes.fim,
    semanaFechada ? true : null
  );
  // Só as primeiras: o cartão não rola, quem quiser a lista toda tem o botão
  // no rodapé que leva ao separador onde ela vive.
  const primeirasContas = contasMotoristas.slice(0, 6);

  const faturado = useFaturacaoMovimentos(range.from, range.to, semana.inicio, semana.fim);
  const { resumo: cartoesObe } = useCartoesObeResumo();
  const { resumo: recibos } = useRecibosVerdesResumo();

  const loading = loadingPlataformas || loadingMes || loadingPendentes || faturado.loading;
  const semanaLabel = `${format(semana.inicio, 'd MMM', { locale: pt })} – ${format(semana.fim, 'd MMM', { locale: pt })}`;
  const plataformasLabel = `${format(plataformasInicio, 'd MMM', { locale: pt })} – ${format(plataformasFim, 'd MMM', { locale: pt })}`;

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
  if (pendentes.count > 0) {
    categoriasAlerta.push({
      id: 'recibos',
      icon: FileText,
      cor: 'warning',
      titulo: 'Recibos',
      descricao: `${pendentes.count} por emitir · ${fmtEur(pendentes.valor)}`,
      detalhe: null,
      contagem: pendentes.count,
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
      detalhe:
        contratosARenovar.length > 1 ? `+${contratosARenovar.length - 1} outros contratos` : null,
      contagem: contratosARenovar.length,
      href: '/renting/contratos',
    });
  }

  return (
    // Sem padding próprio: o `main` do DashboardLayout já traz `p-4 md:p-8`, e
    // somar os dois roubava meia dúzia de linhas de altura.
    // A altura é a do ecrã menos esse padding (2rem em cima + 2rem em baixo),
    // e só a partir de `xl`, que é onde as duas colunas existem — abaixo disso
    // a página é uma coluna só e tem mesmo de rolar.
    <div className="flex flex-col space-y-3 xl:h-[calc(100vh-4rem)]">
      <DashboardInicioHeader perfil="Financeiro" className="shrink-0 lg:pb-4 lg:mb-4" />

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[1.6fr_1fr]">
          {/* ── Coluna esquerda: faixa de KPIs + gráficos + plataformas ───── */}
          <div className="space-y-4 xl:flex xl:min-h-0 xl:flex-col">
            <div className="grid shrink-0 grid-cols-2 border-b border-border sm:grid-cols-3 lg:grid-cols-5">
              <KpiItem
                icon={CircleDollarSign}
                cor="success"
                label="Faturado hoje"
                valor={fmtEur(faturado.hoje.valor)}
                onClick={() => navigate('/administrativo')}
                index={0}
              >
                <span className="text-[11px] text-muted-foreground">
                  <b className="font-semibold text-foreground tabular-nums">
                    {faturado.hoje.count}
                  </b>{' '}
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
                valor={fmtEur(pendentes.valor)}
                onClick={() => navigate('/administrativo/faturacao')}
                index={2}
              >
                <span className="text-[11px] text-muted-foreground">
                  <b className="font-semibold text-foreground tabular-nums">{pendentes.count}</b>{' '}
                  recibos
                </span>
              </KpiItem>
              {/* Em atraso não leva janela de tempo: uma cobrança vencida em
                  julho continua vencida hoje. Vinha de um resumo restrito ao
                  mês corrente, o que só deixava passar cobranças vencidas nos
                  dias decorridos do mês — dava 0,00 € quase sempre. Vem agora
                  da mesma reconciliação (valor − recibos − notas de crédito)
                  que alimenta o cartão "Precisa de atenção", para os dois não
                  se contradizerem. */}
              <KpiItem
                icon={CalendarClock}
                cor="destructive"
                label="Em atraso"
                valor={fmtEur(totalEmAberto)}
                onClick={() => navigate('/administrativo/faturacao')}
                index={3}
              >
                <span className="text-[11px] text-muted-foreground">
                  <b className="font-semibold text-foreground tabular-nums">{cobrancas.length}</b>{' '}
                  cobranças há +{DIAS_EM_ABERTO_ALERTA} dias
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

            <div className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-[1fr_15rem]">
              <Card className="rounded-xl shadow-none p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">Faturação</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <ChartMetric
                        corClass="bg-primary"
                        label="Faturado"
                        valor={fmtEur(faturado.periodo.valor)}
                      />
                      <ChartMetric
                        corClass="bg-brand-navy"
                        label="Facturas"
                        valor={faturado.periodo.count}
                      />
                    </div>
                  </div>
                  {/* Único controlo do gráfico: o período. Vive no card porque
                      só filtra este gráfico. */}
                  <PeriodoSelector
                    preset={preset}
                    range={range}
                    onChange={(p, r) => {
                      setPreset(p);
                      setRange(r);
                    }}
                  />
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

            <Card className="flex flex-col p-4 xl:min-h-0 xl:flex-1">
              <div className="mb-3 flex shrink-0 items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold">Plataformas e fornecedores</h2>
                <span className="text-[11px] text-muted-foreground">
                  {semanaFechada ? 'semana fechada · ' : 'semana em curso · '}
                  {plataformasLabel}
                </span>
              </div>
              {/* Duas colunas: em lista única as sete plataformas sozinhas
                  empurravam a coluna esquerda para fora do ecrã, e a largura
                  desta coluna estava a sobrar. `border-b` por linha em vez de
                  `divide-y`, que numa grelha risca também na vertical. */}
              <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
                {dadosPlataformas.map((p, i) => (
                  <div
                    key={p.plataforma}
                    className={cn(
                      'flex items-center justify-between gap-3 border-b border-border/60 py-2.5',
                      // Sem risco por baixo da última linha da grelha, senão
                      // sobra um traço solto acima do padding do cartão. Uma
                      // coluna: só o último; duas colunas: os dois últimos
                      // quando o total é par.
                      'last:border-b-0',
                      i >= dadosPlataformas.length - (dadosPlataformas.length % 2 === 0 ? 2 : 1) &&
                        'sm:border-b-0'
                    )}
                  >
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
          </div>

          {/* ── Coluna direita: atenção + cartões/OBE + contas ─────────────── */}
          <div className="space-y-4 xl:flex xl:min-h-0 xl:flex-col">
            <Card className="flex shrink-0 flex-col p-4">
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

            <Card className="shrink-0 p-4">
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
                  <div className="text-lg font-semibold tabular-nums">
                    {cartoesObe.cartoes.total}
                  </div>
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

            <ContasMotoristasCard
              contas={contasMotoristas}
              semanaFechada={semanaFechada}
              formatarEuro={fmtEur}
            />
          </div>
        </div>
      )}
    </div>
  );
}
