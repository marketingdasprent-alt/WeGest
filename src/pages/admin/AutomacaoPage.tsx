import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Bot, RotateCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  useAutomationRunsCounts,
  useNotificationQueueCounts,
  useFailedJobs,
  useRetryFailedJob,
} from '@/hooks/useAutomationQueue';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendentes',
  running: 'A correr',
  completed: 'Concluídos',
  sent: 'Enviados',
  failed: 'Falhados',
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

export default function AutomacaoPage() {
  const { toast } = useToast();
  const { data: runCounts } = useAutomationRunsCounts();
  const { data: queueCounts } = useNotificationQueueCounts();
  const { data: failedJobs = [], isLoading: loadingFailedJobs } = useFailedJobs();
  const retryFailedJob = useRetryFailedJob();

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
    </div>
  );
}
