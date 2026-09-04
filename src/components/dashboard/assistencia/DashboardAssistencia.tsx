import { useMemo, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, UserX, UserCheck, CircleCheck, CalendarClock, Car, Flame } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { DashboardInicioHeader } from '@/components/dashboard/DashboardInicioHeader';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { KpiItem } from '@/components/dashboard/KpiItem';
import {
  AlertaCategoriaRow,
  type CategoriaAlerta,
} from '@/components/dashboard/AlertaCategoriaRow';
import { ChartMetric } from '@/components/dashboard/ChartMetric';
import { PeriodoSelector } from '@/components/dashboard/PeriodoSelector';
import { getPeriodRange, type DateRange, type PeriodPreset } from '@/components/dashboard/periodo';
import { useAuth } from '@/contexts/AuthContext';
import {
  useAssistenciaInicioResumo,
  DIAS_ABERTO_DEMAIS,
  type Prioridade,
} from '@/hooks/useAssistenciaInicioResumo';
import { construirSerieTickets, totaisDaSerie } from './serieTickets';

const TicketsChart = lazy(() => import('./TicketsChart'));

/** Dias a partir dos quais um ticket por atribuir passa a ser um aviso. */
const DIAS_SEM_ATRIBUIR_ALERTA = 3;

const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  urgente: 'Urgente',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

const PRIORIDADE_COR: Record<Prioridade, string> = {
  urgente: 'bg-destructive',
  alta: 'bg-warning',
  media: 'bg-brand-navy',
  baixa: 'bg-muted-foreground/50',
};

export function DashboardAssistencia() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    kpis,
    categorias,
    prioridades,
    semPrioridade,
    porAtribuir,
    atrasados,
    viaturasComTicket,
    movimentos,
    loading,
  } = useAssistenciaInicioResumo(user?.id);

  // Período do gráfico — o mesmo seletor das outras duas dashboards, e como lá
  // só filtra este gráfico: os KPIs e os alertas são sempre do momento actual.
  const [preset, setPreset] = useState<PeriodPreset>('mes');
  const [range, setRange] = useState<DateRange>(() => getPeriodRange('mes'));

  // Trocar de período é só voltar a somar: os movimentos já vieram todos ao dia.
  const serie = useMemo(() => construirSerieTickets(movimentos, range), [movimentos, range]);
  const totais = totaisDaSerie(serie);

  const urgentes = prioridades.find((p) => p.prioridade === 'urgente')?.contagem ?? 0;

  const linhasPrioridade = [
    ...prioridades.map((p) => ({
      chave: p.prioridade,
      label: PRIORIDADE_LABEL[p.prioridade],
      corClass: PRIORIDADE_COR[p.prioridade],
      contagem: p.contagem,
    })),
    ...(semPrioridade > 0
      ? [
          {
            chave: 'sem',
            label: 'Sem prioridade',
            corClass: 'bg-muted-foreground/40',
            contagem: semPrioridade,
          },
        ]
      : []),
  ];

  // As contagens por categoria não somam necessariamente "Por resolver": um
  // ticket pode não ter categoria nenhuma. Mostrar só as categorias deixava a
  // diferença por explicar (10 num ecrã que diz 13) — a linha "Sem categoria"
  // fecha a conta e, ainda por cima, é trabalho de arrumação a fazer.
  const totalCategorizados = categorias.reduce((s, c) => s + c.contagem, 0);
  const semCategoria = Math.max(0, kpis.porResolver - totalCategorizados);
  const linhasCategoria = [
    ...categorias.filter((c) => c.contagem > 0),
    ...(semCategoria > 0
      ? [
          {
            id: 'sem-categoria',
            nome: 'Sem categoria',
            cor: 'hsl(var(--muted-foreground))',
            icone: 'wrench',
            contagem: semCategoria,
          },
        ]
      : []),
  ];

  // Mesma leitura das outras dashboards: cada categoria mostra o caso mais
  // grave, e a segunda linha diz quantos mais existem.
  const categoriasAlerta: CategoriaAlerta[] = [];
  if (atrasados.length > 0) {
    const pior = atrasados[0];
    categoriasAlerta.push({
      id: 'atrasados',
      icon: CalendarClock,
      cor: 'destructive',
      titulo: 'Prazo ultrapassado',
      descricao: `#${pior.numero} — ${pior.titulo}`,
      detalhe: atrasados.length > 1 ? `+${atrasados.length - 1} outros fora do prazo` : null,
      contagem: atrasados.length,
      // Ao ticket em causa, não à lista: a linha nomeia um ticket concreto e é
      // esse que se quer abrir. `/assistencia/:id` pede a mesma permissão que
      // a lista, por isso quem vê esta dashboard chega lá.
      href: `/assistencia/${pior.id}`,
    });
  }
  const semAtribuirHaDias = porAtribuir.filter((t) => t.diasAberto >= DIAS_SEM_ATRIBUIR_ALERTA);
  if (semAtribuirHaDias.length > 0) {
    const pior = semAtribuirHaDias[0];
    categoriasAlerta.push({
      id: 'por-atribuir',
      icon: UserX,
      cor: 'warning',
      titulo: 'Por atribuir',
      descricao: `#${pior.numero} — aberto há ${pior.diasAberto} dias`,
      detalhe:
        semAtribuirHaDias.length > 1
          ? `+${semAtribuirHaDias.length - 1} outros sem responsável`
          : null,
      contagem: semAtribuirHaDias.length,
      href: `/assistencia/${pior.id}`,
    });
  }
  if (urgentes > 0) {
    categoriasAlerta.push({
      id: 'urgentes',
      icon: Flame,
      cor: 'destructive',
      titulo: 'Urgentes',
      descricao: `${urgentes} ticket${urgentes === 1 ? '' : 's'} com prioridade urgente`,
      detalhe: null,
      contagem: urgentes,
      href: '/assistencia',
    });
  }

  return (
    // Mesma estrutura da Frota e da Financeiro: sem padding próprio (o `main` do
    // DashboardLayout já o traz) e travada à altura do ecrã a partir de `xl`,
    // que é onde as duas colunas existem.
    <div className="flex flex-col space-y-3 xl:h-[calc(100vh-4rem)]">
      <DashboardInicioHeader perfil="Assistência" className="shrink-0 lg:pb-4 lg:mb-4" />

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[1.6fr_1fr]">
          {/* ── Coluna esquerda: KPIs + gráfico + categorias ──────────────── */}
          <div className="space-y-4 xl:flex xl:min-h-0 xl:flex-col">
            <div className="grid shrink-0 grid-cols-2 border-b border-border sm:grid-cols-3 lg:grid-cols-5">
              <KpiItem
                icon={Wrench}
                cor="warning"
                label="Por resolver"
                valor={kpis.porResolver}
                onClick={() => navigate('/assistencia')}
                index={0}
              >
                <span className="text-[11px] text-muted-foreground">tickets abertos</span>
              </KpiItem>
              <KpiItem
                icon={UserX}
                cor="destructive"
                label="Não atribuídos"
                valor={kpis.naoAtribuidos}
                onClick={() => navigate('/assistencia')}
                index={1}
              >
                <span className="text-[11px] text-muted-foreground">
                  {semAtribuirHaDias.length > 0
                    ? `${semAtribuirHaDias.length} há +${DIAS_SEM_ATRIBUIR_ALERTA} dias`
                    : 'nenhum a arrastar-se'}
                </span>
              </KpiItem>
              <KpiItem
                icon={UserCheck}
                cor="navy"
                label="Atribuídos a mim"
                valor={kpis.atribuidosAMim}
                onClick={() => navigate('/assistencia')}
                index={2}
              >
                <span className="text-[11px] text-muted-foreground">por resolver</span>
              </KpiItem>
              {/* Idade, não prazo: nenhum ticket tem data estimada preenchida,
                  por isso "fora do prazo" dava 0 para sempre — e escondia que o
                  mais antigo está aberto há mais de cem dias. */}
              <KpiItem
                icon={CalendarClock}
                cor="destructive"
                label="Mais antigo"
                valor={kpis.diasMaisAntigo > 0 ? `${kpis.diasMaisAntigo}d` : '—'}
                onClick={() => navigate('/assistencia')}
                index={3}
              >
                <span className="text-[11px] text-muted-foreground">
                  {kpis.abertosHaMuito > 0
                    ? `${kpis.abertosHaMuito} há +${DIAS_ABERTO_DEMAIS} dias`
                    : 'nada a acumular'}
                </span>
              </KpiItem>
              <KpiItem
                icon={CircleCheck}
                cor="success"
                label="Resolvidos hoje"
                valor={kpis.resolvidosHoje}
                onClick={() => navigate('/assistencia')}
                index={4}
              >
                <span className="text-[11px] text-muted-foreground">fechados hoje</span>
              </KpiItem>
            </div>

            <Card className="shrink-0 rounded-xl p-4 shadow-none">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">Tickets</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <ChartMetric corClass="bg-brand-navy" label="Abertos" valor={totais.abertos} />
                    <ChartMetric
                      corClass="bg-success"
                      label="Resolvidos"
                      valor={totais.resolvidos}
                    />
                  </div>
                </div>
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
                  <TicketsChart data={serie} />
                </Suspense>
              </div>
            </Card>

            <Card className="flex flex-col p-4 xl:min-h-0 xl:flex-1">
              <div className="mb-3 flex shrink-0 items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold">Categorias</h2>
                <span className="text-[11px] text-muted-foreground">
                  {kpis.porResolver} por resolver
                </span>
              </div>
              {linhasCategoria.length === 0 ? (
                <p className="py-2 text-[13px] text-muted-foreground">
                  {categorias.length === 0
                    ? 'Sem categorias configuradas.'
                    : 'Nenhuma categoria com tickets abertos.'}
                </p>
              ) : (
                // Só as categorias COM tickets, e com barra de proporção: em
                // caixas iguais, dez categorias a zero pesavam tanto no ecrã
                // como as três que precisavam de trabalho.
                // Sem scroll (`overflow` trazia atrás uma barra horizontal por
                // causa da margem negativa das linhas) mas a ESTICAR: as linhas
                // repartem a altura que sobra no cartão, em vez de ficarem
                // amontoadas em cima com um vazio por baixo. O conteúdo de cada
                // uma centra-se na sua faixa, senão a barra descolava do nome.
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:min-h-0 xl:flex-1">
                  {linhasCategoria.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => navigate(`/assistencia?categoria=${c.id}`)}
                      // O nome e a contagem estão em spans separados; o leitor
                      // de ecrã leria "Acidente 3" sem dizer 3 de quê.
                      aria-label={`${c.nome}: ${c.contagem} ticket${c.contagem === 1 ? '' : 's'}`}
                      className="flex flex-col justify-center rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-left transition-colors hover:bg-muted/60"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] font-semibold" title={c.nome}>
                          {c.nome}
                        </span>
                        <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                          {c.contagem}
                        </span>
                      </div>
                      <span className="mt-2 block h-2.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            // Piso de 6%: com a barra grossa e as pontas
                            // redondas, uma categoria com 1 em 12 desenhava-se
                            // como um ponto e não como barra. Só a LARGURA leva
                            // o piso — o número ao lado é sempre o real.
                            width: `${Math.max(6, (c.contagem / Math.max(1, kpis.porResolver)) * 100)}%`,
                            background: c.cor,
                          }}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── Coluna direita: atenção + prioridades + oficina ───────────── */}
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
                <Flame className="h-4 w-4 text-primary" />
                Por prioridade
              </h2>
              {/* A linha "Sem prioridade" só aparece quando existe, mas existe
                  como linha própria: contá-los na média dava um número que a
                  tabela não sustenta. */}
              <div className="mt-3 space-y-2">
                {linhasPrioridade.map((p) => (
                  <div key={p.chave} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 truncate text-[11px] text-muted-foreground">
                      {p.label}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                      <span
                        className={cn('block h-full rounded-full', p.corClass)}
                        style={{
                          width: `${(p.contagem / Math.max(1, kpis.porResolver)) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right text-[13px] font-semibold tabular-nums">
                      {p.contagem}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="flex flex-col p-4 xl:min-h-0 xl:flex-1">
              <div className="mb-3 flex shrink-0 items-baseline justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Car className="h-4 w-4 text-primary" />
                  Viaturas com ticket aberto
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {viaturasComTicket.length} por resolver
                </span>
              </div>
              {viaturasComTicket.length === 0 ? (
                <p className="py-2 text-[13px] text-muted-foreground">
                  Nenhum ticket aberto.
                </p>
              ) : (
                // Da mais parada para a mais recente: o que interessa aqui é
                // quem está há mais tempo à espera.
                <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-hidden">
                  {viaturasComTicket.slice(0, 6).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => navigate(`/assistencia/${t.id}`)}
                      className="-mx-2 flex w-[calc(100%+1rem)] items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">
                          {t.matricula ?? `#${t.numero}`}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">{t.titulo}</div>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 text-[11px] tabular-nums',
                          t.diasAberto > DIAS_ABERTO_DEMAIS
                            ? 'font-semibold text-destructive'
                            : 'text-muted-foreground'
                        )}
                      >
                        {t.diasAberto}d
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
