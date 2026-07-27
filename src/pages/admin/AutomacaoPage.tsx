import { useState, lazy, Suspense, type ComponentType } from 'react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  useAutomationRunsCounts,
  useNotificationQueueCounts,
  useDomainEventsSummary,
  useAutomacaoDesempenho7Dias,
  useAutomacaoUtilizacao,
  useAutomacaoSaude,
  useAutomacaoAtividade14Dias,
  useAutomacaoTimeline,
  useFailedJobs,
} from '@/hooks/useAutomationQueue';
import { ExecucaoDrillDownSheet } from '@/components/admin/automacao/ExecucaoDrillDownSheet';

const AtividadeChart14Dias = lazy(() => import('@/components/admin/automacao/AtividadeChart14Dias'));

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendentes',
  running: 'A correr',
  completed: 'Concluídos',
  sent: 'Enviados',
  failed: 'Falhados',
};

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-amber-600 dark:text-amber-400',
    destructive: 'text-destructive',
  }[tone];
  return (
    <Card>
      <CardContent className="pt-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
        </div>
        {Icon && <Icon className={`h-5 w-5 ${toneClass}`} />}
      </CardContent>
    </Card>
  );
}

function VisaoGeralTab() {
  const { data: runCounts } = useAutomationRunsCounts();
  const { data: queueCounts } = useNotificationQueueCounts();
  const { data: eventCounts } = useDomainEventsSummary();
  const { data: desempenho } = useAutomacaoDesempenho7Dias();
  const { data: utilizacao } = useAutomacaoUtilizacao();
  const { data: saude } = useAutomacaoSaude();
  const { data: atividade14Dias, isLoading: loadingChart } = useAutomacaoAtividade14Dias();
  const { data: failedJobs = [] } = useFailedJobs();

  const pendentes = runCounts?.pending ?? 0;
  const successRatePct = desempenho?.successRate != null ? Math.round(desempenho.successRate * 100) : null;
  const duracaoMedia = desempenho?.duracaoMediaMs != null ? `${(desempenho.duracaoMediaMs / 1000).toFixed(1)}s` : '—';
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
          <MetricCard label="Fila" value={String(Object.values(queueCounts ?? {}).reduce((a, b) => a + b, 0))} />
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
            value={canaisIndisponiveis.length > 0 ? canaisIndisponiveis.map((c) => c.canal).join(', ') : 'Nenhuma'}
            tone={canaisIndisponiveis.length > 0 ? 'destructive' : 'success'}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Atividade — últimos 14 dias</CardTitle>
          <CardDescription>Eventos recebidos, automações executadas e falhas por dia.</CardDescription>
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

function AtividadeTab() {
  const { data: timeline = [] } = useAutomacaoTimeline(20);
  const [runIdAberto, setRunIdAberto] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atividade recente</CardTitle>
        <CardDescription>Últimos 20 eventos — o que foi recebido, o que a Rule Engine fez com eles.</CardDescription>
      </CardHeader>
      <CardContent>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda sem atividade registada.</p>
        ) : (
          <div className="space-y-3">
            {timeline.map((item) => {
              const cor =
                item.ultimo_evento_log === 'falhou'
                  ? 'text-destructive'
                  : item.run_status === 'completed'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-muted-foreground';
              return (
                <button
                  key={item.event_id}
                  type="button"
                  onClick={() => item.run_id && setRunIdAberto(item.run_id)}
                  className="w-full text-left flex items-center justify-between gap-3 text-sm py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded px-2 -mx-2"
                  disabled={!item.run_id}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-lg ${cor}`}>●</span>
                    <span className="truncate">{item.regra_nome ?? item.event_type}</span>
                    {item.detalhe?.notificacoes_criadas != null && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {String(item.detalhe.notificacoes_criadas)} notif. · {String(item.detalhe.emails_enviados ?? 0)} email
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(parseISO(item.occurred_at), 'dd MMM HH:mm:ss', { locale: pt })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
      <ExecucaoDrillDownSheet runId={runIdAberto} onOpenChange={(open) => !open && setRunIdAberto(null)} />
    </Card>
  );
}

export default function AutomacaoPage() {
  const [tab, setTab] = useState('visao-geral');

  return (
    <div className="space-y-6">
      <StickyPageHeader
        title="Automação"
        description="Estado, saúde e controlo do motor de automações do WeGest."
        icon={Bot}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="atividade">Atividade</TabsTrigger>
          <TabsTrigger value="fila">Fila</TabsTrigger>
          <TabsTrigger value="falhas">Falhas</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral">
          <VisaoGeralTab />
        </TabsContent>
        <TabsContent value="atividade">
          <AtividadeTab />
        </TabsContent>
        <TabsContent value="fila">{/* Task 8 */}</TabsContent>
        <TabsContent value="falhas">{/* Task 9 */}</TabsContent>
        <TabsContent value="regras">{/* Task 10 */}</TabsContent>
      </Tabs>
    </div>
  );
}

export { STATUS_LABEL };
