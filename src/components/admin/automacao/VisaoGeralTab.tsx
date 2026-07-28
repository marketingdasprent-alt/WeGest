import { lazy, Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import {
  useAutomationRunsCounts,
  useNotificationQueueCounts,
  useDomainEventsSummary,
  useAutomacaoDesempenho7Dias,
  useAutomacaoUtilizacao,
  useAutomacaoSaude,
  useAutomacaoAtividade14Dias,
  useFailedJobs,
} from '@/hooks/useAutomationQueue';
import { MetricCard } from './MetricCard';

const AtividadeChart14Dias = lazy(() => import('./AtividadeChart14Dias'));

export function VisaoGeralTab() {
  const { data: runCounts } = useAutomationRunsCounts();
  const { data: queueCounts } = useNotificationQueueCounts();
  const { data: eventCounts } = useDomainEventsSummary();
  const { data: desempenho } = useAutomacaoDesempenho7Dias();
  const { data: utilizacao } = useAutomacaoUtilizacao();
  const { data: saude } = useAutomacaoSaude();
  const { data: atividade14Dias, isLoading: loadingChart } = useAutomacaoAtividade14Dias();
  const { data: failedJobs = [] } = useFailedJobs();

  const pendentes = runCounts?.pending ?? 0;
  const successRatePct =
    desempenho?.successRate != null ? Math.round(desempenho.successRate * 100) : null;
  const duracaoMedia =
    desempenho?.duracaoMediaMs != null ? `${(desempenho.duracaoMediaMs / 1000).toFixed(1)}s` : '—';
  const utilizacaoPct = utilizacao != null ? Math.round(utilizacao * 100) : 0;
  const canaisIndisponiveis = (saude?.canais ?? []).filter((c) => c.falhasUltimaHora >= 3);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Estado Geral</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Automation Runs"
            value={String(Object.values(runCounts ?? {}).reduce((a, b) => a + b, 0))}
            icon={Bot}
          />
          <MetricCard label="Event Bus" value={String(eventCounts?.total ?? 0)} />
          <MetricCard
            label="Fila"
            value={String(Object.values(queueCounts ?? {}).reduce((a, b) => a + b, 0))}
          />
          <MetricCard
            label="Success Rate"
            value={successRatePct != null ? `${successRatePct}%` : '—'}
            icon={CheckCircle2}
            tone={successRatePct == null ? 'default' : successRatePct >= 90 ? 'success' : 'warning'}
          />
          <MetricCard
            label="Falhas"
            value={String(failedJobs.length)}
            icon={AlertTriangle}
            tone={failedJobs.length > 0 ? 'destructive' : 'default'}
          />
          <MetricCard label="Tempo médio de execução" value={duracaoMedia} icon={Clock} />
          <MetricCard label="Jobs pendentes" value={String(pendentes)} />
          <MetricCard label="Jobs em retry" value={String(saude?.retriesPendentes ?? 0)} />
        </div>
        <Card className="mt-3">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Utilização</span>
              <span className="text-sm text-muted-foreground tabular-nums">{utilizacaoPct}%</span>
            </div>
            <Progress value={utilizacaoPct} />
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Saúde do Sistema</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Falhas"
            value={String(saude?.falhasNaoResolvidas ?? 0)}
            tone={(saude?.falhasNaoResolvidas ?? 0) > 0 ? 'destructive' : 'success'}
          />
          <MetricCard label="Retries" value={String(saude?.retriesPendentes ?? 0)} />
          <MetricCard
            label="Jobs bloqueados"
            value={String(saude?.bloqueados ?? 0)}
            tone={(saude?.bloqueados ?? 0) > 0 ? 'warning' : 'success'}
          />
          <MetricCard
            label="APIs indisponíveis"
            value={
              canaisIndisponiveis.length > 0
                ? canaisIndisponiveis.map((c) => c.canal).join(', ')
                : 'Nenhuma'
            }
            tone={canaisIndisponiveis.length > 0 ? 'destructive' : 'success'}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Atividade — últimos 14 dias</CardTitle>
          <CardDescription>
            Eventos recebidos, automações executadas e falhas por dia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingChart ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
            <Suspense fallback={<Skeleton className="h-[220px] w-full" />}>
              <AtividadeChart14Dias data={atividade14Dias ?? []} />
            </Suspense>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
