import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RotateCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useAutomacaoTimeline } from '@/hooks/automacao/useAutomacaoStats';
import {
  useAutomationRunsPendentes,
  useFailedJobs,
  useIgnorarFailedJob,
  useRetryFailedJob,
} from '@/hooks/automacao/useAutomationQueueOps';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { ExecucaoDrillDownSheet } from '../ExecucaoDrillDownSheet';
import { DetalheFalhaSheet } from './DetalheFalhaSheet';
import {
  consolidarHistorico,
  filtrarHistorico,
  type EstadoHistorico,
  type LinhaHistorico,
} from './historico';

const FILTROS: { valor: EstadoHistorico | 'todos'; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'sucesso', rotulo: 'Sucesso' },
  { valor: 'pendente', rotulo: 'Pendente' },
  { valor: 'erro', rotulo: 'Erro' },
];

const BADGE: Record<EstadoHistorico, { variante: 'secondary' | 'destructive'; rotulo: string }> = {
  sucesso: { variante: 'secondary', rotulo: 'Sucesso' },
  pendente: { variante: 'secondary', rotulo: 'Pendente' },
  erro: { variante: 'destructive', rotulo: 'Erro' },
};

export function HistoricoExecucoes() {
  const { toast } = useToast();
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.AUTOMACOES);
  const { data: timeline = [], isLoading: aCarregarTimeline } = useAutomacaoTimeline(50);
  const { data: pendentes = [] } = useAutomationRunsPendentes();
  const { data: falhas = [] } = useFailedJobs();
  const retry = useRetryFailedJob();
  const ignorar = useIgnorarFailedJob();

  const [filtro, setFiltro] = useState<EstadoHistorico | 'todos'>('todos');
  const [runAberto, setRunAberto] = useState<string | null>(null);
  const [falhaAberta, setFalhaAberta] = useState<LinhaHistorico | null>(null);

  const linhas = consolidarHistorico(timeline, pendentes, falhas);
  const visiveis = filtrarHistorico(linhas, filtro);
  const contar = (e: EstadoHistorico | 'todos') => filtrarHistorico(linhas, e).length;

  const resolver = async (
    accao: typeof retry | typeof ignorar,
    id: string,
    titulo: string,
    descricao: string
  ) => {
    try {
      await accao.mutateAsync(id);
      toast({ title: titulo, description: descricao });
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível concluir a ação.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Histórico de execuções</CardTitle>
            <CardDescription>
              Tudo o que o motor recebeu, o que fez e o que ficou por resolver.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTROS.map((f) => (
              <Button
                key={f.valor}
                size="sm"
                variant={filtro === f.valor ? 'default' : 'outline'}
                onClick={() => setFiltro(f.valor)}
              >
                {f.rotulo}
                {/* A contagem no botão evita ter de clicar para descobrir
                    que aquele estado está vazio. */}
                <span className="ml-1.5 tabular-nums opacity-70">{contar(f.valor)}</span>
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {aCarregarTimeline ? (
          <Skeleton className="h-24 w-full" />
        ) : visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {linhas.length === 0
              ? 'Ainda sem atividade registada.'
              : 'Nenhuma execução neste estado.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estado</TableHead>
                <TableHead>Automação</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Detalhe</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Badge variant={BADGE[l.estado].variante}>{BADGE[l.estado].rotulo}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{l.titulo}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {l.origem}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="max-w-[260px] truncate text-sm text-muted-foreground"
                    title={l.detalhe ?? ''}
                  >
                    {l.detalhe ?? '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">{l.tentativas ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(parseISO(l.quando), 'dd MMM HH:mm:ss', { locale: pt })}
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    {l.runId && (
                      <Button size="sm" variant="ghost" onClick={() => setRunAberto(l.runId)}>
                        Histórico
                      </Button>
                    )}
                    {/* Só as falhas por resolver têm jobId — e são as únicas
                        que se podem reagendar ou dar por encerradas. */}
                    {l.jobId && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setFalhaAberta(l)}>
                          Ver detalhes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!podeGerir || retry.isPending}
                          onClick={() =>
                            resolver(retry, l.jobId!, 'Reagendado', 'O job voltou a pendente.')
                          }
                        >
                          <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                          Tentar novamente
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!podeGerir || ignorar.isPending}
                          onClick={() =>
                            resolver(ignorar, l.jobId!, 'Ignorado', 'Marcado como resolvido.')
                          }
                        >
                          Ignorar
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <ExecucaoDrillDownSheet
        runId={runAberto}
        onOpenChange={(aberto) => !aberto && setRunAberto(null)}
      />
      <DetalheFalhaSheet
        linha={falhaAberta}
        onOpenChange={(aberto) => !aberto && setFalhaAberta(null)}
      />
    </Card>
  );
}
