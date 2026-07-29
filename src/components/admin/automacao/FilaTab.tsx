import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useAutomationRunsPendentes } from '@/hooks/useAutomationQueue';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendentes',
  running: 'A correr',
  completed: 'Concluídos',
  sent: 'Enviados',
  failed: 'Falhados',
};

export function FilaTab() {
  const { data: pendentes = [], isLoading } = useAutomationRunsPendentes();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fila de processamento</CardTitle>
        <CardDescription>
          Automações à espera do próximo ciclo do Automation Executor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : pendentes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Fila vazia — nada à espera de processamento.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Próxima tentativa</TableHead>
                <TableHead>Prioridade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendentes.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{run.job_type}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{STATUS_LABEL[run.status] ?? run.status}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{run.attempt}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(parseISO(run.next_attempt_at), 'dd MMM HH:mm:ss', { locale: pt })}
                  </TableCell>
                  <TableCell className="tabular-nums">{run.priority}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
