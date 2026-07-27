import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Bot, RotateCw, Activity } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  useAutomationRunsCounts,
  useNotificationQueueCounts,
  useFailedJobs,
  useRetryFailedJob,
  useDomainEventsSummary,
  useNotificationsSummary,
  useRecentAutomationLogs,
} from '@/hooks/useAutomationQueue';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendentes',
  running: 'A correr',
  completed: 'Concluídos',
  sent: 'Enviados',
  failed: 'Falhados',
};

const EVENTO_LABEL: Record<string, string> = {
  executada: 'Executada',
  falhou: 'Falhou',
  ignorada_cooldown: 'Ignorada (cooldown)',
  condicao_nao_satisfeita: 'Condição não satisfeita',
};

const EVENTO_VARIANT: Record<string, 'default' | 'destructive' | 'secondary'> = {
  executada: 'default',
  falhou: 'destructive',
  ignorada_cooldown: 'secondary',
  condicao_nao_satisfeita: 'secondary',
};

function StatusCountsCard({ title, counts }: { title: string; counts: Record<string, number> | undefined }) {
  const entries = Object.entries(counts ?? {});
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem registos.</p>
        ) : (
          entries.map(([status, count]) => (
            <div key={status} className="flex flex-col items-center gap-1 min-w-[80px]">
              <span className="text-2xl font-bold tabular-nums">{count}</span>
              <span className="text-xs text-muted-foreground">{STATUS_LABEL[status] ?? status}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-1 min-w-[80px]">
            <span className="text-2xl font-bold tabular-nums">{item.value}</span>
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AutomacaoPage() {
  const { toast } = useToast();
  const { data: runCounts } = useAutomationRunsCounts();
  const { data: queueCounts } = useNotificationQueueCounts();
  const { data: failedJobs = [], isLoading: loadingFailedJobs } = useFailedJobs();
  const retryFailedJob = useRetryFailedJob();
  const { data: eventCounts } = useDomainEventsSummary();
  const { data: notifCounts } = useNotificationsSummary();
  const { data: recentLogs = [] } = useRecentAutomationLogs();

  const handleRetry = async (id: string) => {
    try {
      await retryFailedJob.mutateAsync(id);
      toast({ title: 'Reagendado', description: 'O job foi posto novamente em pendente.' });
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível reagendar o job.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <StickyPageHeader
        title="Automação — Fila & Falhas"
        description="Estado do motor de automação: regras, filas de execução e envios que precisam de atenção."
        icon={Bot}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatusCountsCard title="Automation Runs" counts={runCounts} />
        <StatusCountsCard title="Fila de Notificações" counts={queueCounts} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SummaryCard
          title="Eventos (Event Bus)"
          items={[
            { label: 'Total', value: eventCounts?.total ?? 0 },
            { label: 'Processados', value: eventCounts?.processados ?? 0 },
            { label: 'Por processar', value: eventCounts?.porProcessar ?? 0 },
          ]}
        />
        <SummaryCard
          title="Notificações"
          items={[
            { label: 'Total', value: notifCounts?.total ?? 0 },
            { label: 'Não lidas', value: notifCounts?.naoLidas ?? 0 },
            { label: 'Resolvidas', value: notifCounts?.resolvidas ?? 0 },
          ]}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Falhas por resolver</CardTitle>
          <CardDescription>
            Jobs que esgotaram as tentativas automáticas — reagenda manualmente depois de corrigir a causa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingFailedJobs ? (
            <p className="text-sm text-muted-foreground">A carregar...</p>
          ) : failedJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem falhas por resolver.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Origem</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Último erro</TableHead>
                  <TableHead>Falhou em</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell><Badge variant="outline">{job.source_table}</Badge></TableCell>
                    <TableCell>{job.job_type}</TableCell>
                    <TableCell className="tabular-nums">{job.attempts}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground" title={job.last_error ?? ''}>
                      {job.last_error ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(parseISO(job.failed_at), 'dd MMM yyyy HH:mm', { locale: pt })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRetry(job.id)}
                        disabled={retryFailedJob.isPending}
                      >
                        <RotateCw className="h-3.5 w-3.5 mr-1.5" />
                        Tentar novamente
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Atividade recente
          </CardTitle>
          <CardDescription>
            Últimas 20 execuções do Rule Engine — o que casou, o que falhou, o que foi ignorado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda sem atividade registada.</p>
          ) : (
            <div className="space-y-1.5">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={EVENTO_VARIANT[log.evento] ?? 'secondary'} className="shrink-0">
                      {EVENTO_LABEL[log.evento] ?? log.evento}
                    </Badge>
                    <span className="truncate text-muted-foreground">{log.regra_nome ?? '—'}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(parseISO(log.created_at), 'dd MMM HH:mm:ss', { locale: pt })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
