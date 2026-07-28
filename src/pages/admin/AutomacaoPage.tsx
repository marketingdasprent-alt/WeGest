import { useState, useEffect, lazy, Suspense, type ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bot,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  RotateCw,
  PlayCircle,
  Settings2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  useAutomationRunsCounts,
  useNotificationQueueCounts,
  useDomainEventsSummary,
  useAutomacaoDesempenho7Dias,
  useAutomacaoUtilizacao,
  useAutomacaoSaude,
  useAutomacaoAtividade14Dias,
  useAutomacaoTimeline,
  useAutomationRunsPendentes,
  useFailedJobs,
  useRetryFailedJob,
  useIgnorarFailedJob,
  useAutomacaoEstatisticasPorRegra,
  useToggleAutomationRule,
  useExecutarAutomacoesManualmente,
  useAutomationRuleConfig,
  useCargosDisponiveis,
  useUtilizadoresPorCargo,
  useAtualizarConfigRegra,
  type FailedJob,
  type AutomationRuleAcaoConfig,
  type UtilizadorPorCargo,
} from '@/hooks/useAutomationQueue';
import { ExecucaoDrillDownSheet } from '@/components/admin/automacao/ExecucaoDrillDownSheet';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

const AtividadeChart14Dias = lazy(
  () => import('@/components/admin/automacao/AtividadeChart14Dias')
);

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

function AtividadeTab() {
  const { data: timeline = [] } = useAutomacaoTimeline(20);
  const [runIdAberto, setRunIdAberto] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atividade recente</CardTitle>
        <CardDescription>
          Últimos 20 eventos — o que foi recebido, o que a Rule Engine fez com eles.
        </CardDescription>
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
                        {String(item.detalhe.notificacoes_criadas)} notif. ·{' '}
                        {String(item.detalhe.emails_enviados ?? 0)} email
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
      <ExecucaoDrillDownSheet
        runId={runIdAberto}
        onOpenChange={(open) => !open && setRunIdAberto(null)}
      />
    </Card>
  );
}

function FilaTab() {
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

function FalhasTab() {
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

const MODULOS_REGRA: Record<string, string> = {
  viatura: 'Viaturas',
  motorista: 'Motoristas',
  cobranca: 'Financeiro',
  contrato_renting: 'Renting',
  utilizador: 'Utilizadores',
};

function moduloDaRegra(eventType: string): string {
  const prefixo = eventType.split('.')[0];
  return MODULOS_REGRA[prefixo] ?? 'Outros';
}

function RegrasTab() {
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.AUTOMACOES);
  const { data: regras = [], isLoading } = useAutomacaoEstatisticasPorRegra();
  const toggleRule = useToggleAutomationRule();
  const { toast } = useToast();
  const [moduloFiltro, setModuloFiltro] = useState('todos');
  const [regraAConfigurar, setRegraAConfigurar] = useState<{ id: string; nome: string } | null>(
    null
  );

  const handleToggle = async (id: string, ativo: boolean) => {
    try {
      await toggleRule.mutateAsync({ id, ativo });
      toast({ title: ativo ? 'Regra ligada' : 'Regra desligada' });
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível atualizar a regra.',
        variant: 'destructive',
      });
    }
  };

  const modulosPresentes = Array.from(
    new Set(regras.map((r) => moduloDaRegra(r.event_type)))
  ).sort();
  const regrasFiltradas =
    moduloFiltro === 'todos'
      ? regras
      : regras.filter((r) => moduloDaRegra(r.event_type) === moduloFiltro);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Estatísticas por automação</CardTitle>
            <CardDescription>
              Execuções, falhas e duração média de cada regra — liga ou desliga aqui.
            </CardDescription>
          </div>
          {modulosPresentes.length > 1 && (
            <Select value={moduloFiltro} onValueChange={setModuloFiltro}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os módulos</SelectItem>
                {modulosPresentes.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : regras.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda sem regras configuradas.</p>
        ) : regrasFiltradas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma regra neste módulo.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Automação</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Execuções</TableHead>
                <TableHead>Última execução</TableHead>
                <TableHead>Tempo médio</TableHead>
                <TableHead>Falhas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Destinatários</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regrasFiltradas.map((regra) => (
                <TableRow key={regra.rule_id}>
                  <TableCell className="font-medium">{regra.nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{moduloDaRegra(regra.event_type)}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{regra.execucoes}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {regra.ultima_execucao
                      ? format(parseISO(regra.ultima_execucao), 'dd MMM HH:mm', { locale: pt })
                      : '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {regra.duracao_media_ms != null
                      ? `${(regra.duracao_media_ms / 1000).toFixed(1)}s`
                      : '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <Badge variant={regra.falhas > 0 ? 'destructive' : 'secondary'}>
                      {regra.falhas}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={regra.ativo}
                      onCheckedChange={(checked) => handleToggle(regra.rule_id, checked)}
                      disabled={!podeGerir || toggleRule.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!podeGerir}
                      onClick={() => setRegraAConfigurar({ id: regra.rule_id, nome: regra.nome })}
                    >
                      <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                      Configurar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <ConfigurarRegraSheet
        regra={regraAConfigurar}
        onOpenChange={(open) => !open && setRegraAConfigurar(null)}
      />
    </Card>
  );
}

// Referência estável — um `[]` inline como default de desestruturação cria
// um array novo a cada render, o que fazia o useEffect de limpeza (que
// depende de utilizadoresDoCargo) disparar para sempre.
const SEM_UTILIZADORES: UtilizadorPorCargo[] = [];

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeiras = partes.length > 1 ? [partes[0], partes[partes.length - 1]] : [partes[0]];
  return primeiras.map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function ConfigurarRegraSheet({
  regra,
  onOpenChange,
}: {
  regra: { id: string; nome: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.AUTOMACOES);
  const { data: config, isLoading } = useAutomationRuleConfig(regra?.id ?? null);
  const { data: cargos = [] } = useCargosDisponiveis();
  const atualizar = useAtualizarConfigRegra();

  const [destinatariosCargoIds, setDestinatariosCargoIds] = useState<string[]>([]);
  const [destinatariosModo, setDestinatariosModo] = useState<'grupo' | 'individual'>('grupo');
  const [destinatariosUserIds, setDestinatariosUserIds] = useState<string[]>([]);
  const { data: utilizadoresDoCargo = SEM_UTILIZADORES } =
    useUtilizadoresPorCargo(destinatariosCargoIds);
  const [enviarEmail, setEnviarEmail] = useState(false);
  const [enviarEmailDigest, setEnviarEmailDigest] = useState(false);
  const [cooldownMinutos, setCooldownMinutos] = useState(0);

  useEffect(() => {
    if (!config) return;
    setDestinatariosCargoIds(config.acao_config.destinatarios_cargo_ids ?? []);
    setDestinatariosModo(config.acao_config.destinatarios_modo ?? 'grupo');
    setDestinatariosUserIds(config.acao_config.destinatarios_user_ids ?? []);
    setEnviarEmail(config.acao_config.enviar_email ?? false);
    setEnviarEmailDigest(config.acao_config.enviar_email_digest ?? false);
    setCooldownMinutos(config.cooldown_minutos);
  }, [config]);

  // Se um cargo for desmarcado, tira também da seleção individual quem já
  // não pertence a nenhum dos cargos escolhidos (evita lixo escondido).
  useEffect(() => {
    setDestinatariosUserIds((prev) =>
      prev.filter((id) => utilizadoresDoCargo.some((u) => u.id === id))
    );
  }, [utilizadoresDoCargo]);

  const handleGuardar = async () => {
    if (!regra || !config) return;
    if (!podeGerir) {
      toast({
        title: 'Sem permissão',
        description: 'Não tens permissão para configurar automações.',
        variant: 'destructive',
      });
      return;
    }
    const novoAcaoConfig: AutomationRuleAcaoConfig = {
      ...config.acao_config,
      destinatarios_cargo_ids: destinatariosCargoIds,
      destinatarios_estrategia: 'cargo',
      destinatarios_modo: destinatariosModo,
      destinatarios_user_ids: destinatariosModo === 'individual' ? destinatariosUserIds : undefined,
      enviar_email: enviarEmail,
      enviar_email_digest: enviarEmail ? enviarEmailDigest : false,
    };
    try {
      await atualizar.mutateAsync({ id: regra.id, acaoConfig: novoAcaoConfig, cooldownMinutos });
      toast({ title: 'Configuração guardada' });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erro',
        description:
          error instanceof Error ? error.message : 'Não foi possível guardar a configuração.',
        variant: 'destructive',
      });
    }
  };

  const cooldownTexto =
    cooldownMinutos <= 0
      ? 'Sem cooldown — reage sempre que a condição for satisfeita'
      : cooldownMinutos % 1440 === 0
        ? `${cooldownMinutos / 1440} dia(s)`
        : cooldownMinutos % 60 === 0
          ? `${cooldownMinutos / 60} hora(s)`
          : `${cooldownMinutos} minuto(s)`;

  return (
    <Sheet open={!!regra} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle>Configurar: {regra?.nome}</SheetTitle>
          <SheetDescription>Quem recebe esta automação e com que frequência</SheetDescription>
        </SheetHeader>

        {isLoading || !config ? (
          <Skeleton className="mt-6 h-64 w-full" />
        ) : (
          <div className="mt-6 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Grupos que recebem (além dos admins)</Label>
              <div className="flex flex-wrap gap-2">
                {cargos.map((c) => {
                  const selecionado = destinatariosCargoIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={selecionado}
                      onClick={() =>
                        setDestinatariosCargoIds((prev) =>
                          selecionado ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                        )
                      }
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                        selecionado
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      )}
                    >
                      {c.nome}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Quem pertencer a um destes grupos (Definições → Grupos) recebe a notificação, além
                de qualquer administrador.
              </p>
            </div>

            {destinatariosCargoIds.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Escolher pessoas específicas</Label>
                  <p className="text-xs text-muted-foreground">
                    Em vez de todos os utilizadores destes grupos, escolhe só quem deve receber.
                  </p>
                </div>
                <Switch
                  checked={destinatariosModo === 'individual'}
                  onCheckedChange={(checked) =>
                    setDestinatariosModo(checked ? 'individual' : 'grupo')
                  }
                />
              </div>
            )}

            {destinatariosModo === 'individual' && utilizadoresDoCargo.length > 0 && (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                {utilizadoresDoCargo.map((u) => {
                  const selecionado = destinatariosUserIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-pressed={selecionado}
                      onClick={() =>
                        setDestinatariosUserIds((prev) =>
                          selecionado ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                        )
                      }
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors',
                        selecionado ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                          selecionado
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {iniciais(u.nome)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{u.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {u.email}
                        </span>
                      </span>
                      {selecionado && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm">Enviar também por email</Label>
                <p className="text-xs text-muted-foreground">
                  Requer um template de email configurado para este código.
                </p>
              </div>
              <Switch checked={enviarEmail} onCheckedChange={setEnviarEmail} />
            </div>

            {enviarEmail && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Agrupar num resumo diário</Label>
                  <p className="text-xs text-muted-foreground">
                    Em vez de 1 email por aviso, junta tudo o que a pessoa tem pendente num único
                    email por dia. Recomendado sempre que muitos itens possam ficar prontos de uma
                    vez (ex.: um backlog).
                  </p>
                </div>
                <Switch checked={enviarEmailDigest} onCheckedChange={setEnviarEmailDigest} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Cooldown (minutos entre avisos repetidos para a mesma entidade)</Label>
              <Input
                type="number"
                min={0}
                step={60}
                value={cooldownMinutos}
                onChange={(e) => setCooldownMinutos(Math.max(0, Number(e.target.value) || 0))}
              />
              <p className="text-xs text-muted-foreground">{cooldownTexto}</p>
            </div>

            <Button
              onClick={handleGuardar}
              disabled={!podeGerir || atualizar.isPending}
              className="w-full"
            >
              {atualizar.isPending ? 'A guardar…' : 'Guardar'}
            </Button>
            {!podeGerir && (
              <p className="text-center text-xs text-muted-foreground">
                Não tens permissão para configurar automações.
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Espelha o rate limit do servidor (5 min) — só para feedback imediato;
// a única fonte de verdade é a RPC, que bloqueia mesmo do lado do servidor.
const RATE_LIMIT_MS = 5 * 60 * 1000;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function CorrerAgoraButton() {
  const { toast } = useToast();
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.AUTOMACOES);
  const executar = useExecutarAutomacoesManualmente();
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (cooldownEnd === null) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [cooldownEnd]);

  const emCooldown = cooldownEnd !== null && nowTick < cooldownEnd;

  const handleClick = async () => {
    try {
      await executar.mutateAsync();
      setCooldownEnd(Date.now() + RATE_LIMIT_MS);
      toast({
        title: 'Automações executadas',
        description: 'Scans de expirações/renovações/cobranças e o motor de regras correram agora.',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível correr',
        description: error instanceof Error ? error.message : 'Erro desconhecido.',
        variant: 'destructive',
      });
    }
  };

  if (!podeGerir) return null;

  return (
    <Button onClick={handleClick} disabled={executar.isPending || emCooldown} size="sm">
      <PlayCircle className={`h-4 w-4 mr-1.5 ${executar.isPending ? 'animate-spin' : ''}`} />
      {executar.isPending
        ? 'A correr…'
        : emCooldown
          ? `Aguarda ${formatCountdown(cooldownEnd - nowTick)}`
          : 'Correr agora'}
    </Button>
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
      >
        <CorrerAgoraButton />
      </StickyPageHeader>

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
        <TabsContent value="fila">
          <FilaTab />
        </TabsContent>
        <TabsContent value="falhas">
          <FalhasTab />
        </TabsContent>
        <TabsContent value="regras">
          <RegrasTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { STATUS_LABEL };
