import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { RotateCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  useFailedJobs,
  useRetryFailedJob,
  useIgnorarFailedJob,
  type FailedJob,
} from '@/hooks/useAutomationQueue';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

export function FalhasTab() {
  const { toast } = useToast();
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.AUTOMACOES);
  const { data: failedJobs = [], isLoading } = useFailedJobs();
  const retryFailedJob = useRetryFailedJob();
  const ignorarFailedJob = useIgnorarFailedJob();
  const [detalheAberto, setDetalheAberto] = useState<FailedJob | null>(null);

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

  const handleIgnorar = async (id: string) => {
    try {
      await ignorarFailedJob.mutateAsync(id);
      toast({ title: 'Ignorado', description: 'O job foi marcado como resolvido.' });
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível ignorar o job.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Falhas por resolver</CardTitle>
        <CardDescription>Jobs que esgotaram as tentativas automáticas.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
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
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <Badge variant="outline">{job.source_table}</Badge>
                  </TableCell>
                  <TableCell>{job.job_type}</TableCell>
                  <TableCell className="tabular-nums">{job.attempts}</TableCell>
                  <TableCell
                    className="max-w-[280px] truncate text-sm text-muted-foreground"
                    title={job.last_error ?? ''}
                  >
                    {job.last_error ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(parseISO(job.failed_at), 'dd MMM yyyy HH:mm', { locale: pt })}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => setDetalheAberto(job)}>
                      Ver detalhes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRetry(job.id)}
                      disabled={!podeGerir || retryFailedJob.isPending}
                    >
                      <RotateCw className="h-3.5 w-3.5 mr-1.5" />
                      Tentar novamente
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleIgnorar(job.id)}
                      disabled={!podeGerir || ignorarFailedJob.isPending}
                    >
                      Ignorar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Sheet open={!!detalheAberto} onOpenChange={(open) => !open && setDetalheAberto(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Detalhes da falha</SheetTitle>
            <SheetDescription>
              Registo completo do job que esgotou as tentativas automáticas.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2 text-sm">
            <p>
              <strong>Origem:</strong> {detalheAberto?.source_table}
            </p>
            <p>
              <strong>Tipo:</strong> {detalheAberto?.job_type}
            </p>
            <p>
              <strong>Tentativas:</strong> {detalheAberto?.attempts}
            </p>
            <p className="whitespace-pre-wrap">
              <strong>Erro:</strong> {detalheAberto?.last_error ?? '—'}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
