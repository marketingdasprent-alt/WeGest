import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function countByStatus(table: 'automation_runs' | 'notification_queue'): Promise<Record<string, number>> {
  const { data, error } = await supabase.from(table).select('status');
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const status = (row as { status: string }).status;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export interface FailedJob {
  id: string;
  source_table: string;
  job_type: string;
  attempts: number;
  last_error: string | null;
  failed_at: string;
  resolved: boolean;
}

export function useAutomationRunsCounts() {
  return useQuery({
    queryKey: ['automation-runs-counts'],
    queryFn: () => countByStatus('automation_runs'),
    refetchInterval: 30_000,
  });
}

export function useNotificationQueueCounts() {
  return useQuery({
    queryKey: ['notification-queue-counts'],
    queryFn: () => countByStatus('notification_queue'),
    refetchInterval: 30_000,
  });
}

export function useFailedJobs() {
  return useQuery({
    queryKey: ['failed-jobs'],
    queryFn: async (): Promise<FailedJob[]> => {
      const { data, error } = await supabase
        .from('failed_jobs')
        .select('id, source_table, job_type, attempts, last_error, failed_at, resolved')
        .eq('resolved', false)
        .order('failed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as FailedJob[];
    },
    refetchInterval: 30_000,
  });
}

export function useRetryFailedJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('retry_failed_job', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['failed-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['automation-runs-counts'] });
      queryClient.invalidateQueries({ queryKey: ['notification-queue-counts'] });
    },
  });
}

export interface DomainEventsSummary {
  total: number;
  processados: number;
  porProcessar: number;
}

export function useDomainEventsSummary() {
  return useQuery({
    queryKey: ['domain-events-summary'],
    queryFn: async (): Promise<DomainEventsSummary> => {
      const { data, error } = await supabase.from('domain_events').select('processed_at');
      if (error) throw error;
      const rows = data ?? [];
      const processados = rows.filter((r) => r.processed_at !== null).length;
      return { total: rows.length, processados, porProcessar: rows.length - processados };
    },
    refetchInterval: 30_000,
  });
}

export interface NotificationsSummary {
  total: number;
  naoLidas: number;
  resolvidas: number;
}

export function useNotificationsSummary() {
  return useQuery({
    queryKey: ['notifications-summary'],
    queryFn: async (): Promise<NotificationsSummary> => {
      const { data, error } = await supabase.from('notifications').select('lida, resolvida');
      if (error) throw error;
      const rows = data ?? [];
      return {
        total: rows.length,
        naoLidas: rows.filter((r) => !r.lida).length,
        resolvidas: rows.filter((r) => r.resolvida).length,
      };
    },
    refetchInterval: 30_000,
  });
}

export interface AutomationLogEntry {
  id: string;
  evento: string;
  created_at: string;
  regra_nome: string | null;
}

export interface AutomacaoTimelineItem {
  event_id: string;
  event_type: string;
  occurred_at: string;
  entity_table: string;
  entity_id: string;
  run_id: string | null;
  rule_id: string | null;
  regra_nome: string | null;
  run_status: string | null;
  started_at: string | null;
  completed_at: string | null;
  attempt: number | null;
  ultimo_evento_log: string | null;
  duracao_ms: number | null;
  detalhe: Record<string, unknown> | null;
}

export function useAutomacaoTimeline(limit = 20) {
  return useQuery({
    queryKey: ['automacao-timeline', limit],
    queryFn: async (): Promise<AutomacaoTimelineItem[]> => {
      const { data, error } = await supabase
        .from('automacao_timeline_recente')
        .select('*')
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AutomacaoTimelineItem[];
    },
    refetchInterval: 15_000,
  });
}

export interface RunLogEntry {
  id: string;
  evento: string;
  detalhe: Record<string, unknown>;
  duracao_ms: number | null;
  created_at: string;
}

export function useRunLogHistory(runId: string | null) {
  return useQuery({
    queryKey: ['run-log-history', runId],
    queryFn: async (): Promise<RunLogEntry[]> => {
      const { data, error } = await supabase
        .from('automation_logs')
        .select('id, evento, detalhe, duracao_ms, created_at')
        .eq('run_id', runId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RunLogEntry[];
    },
    enabled: !!runId,
  });
}

export interface RegraEstatistica {
  rule_id: string;
  nome: string;
  event_type: string;
  ativo: boolean;
  cooldown_minutos: number;
  execucoes: number;
  falhas: number;
  ultima_execucao: string | null;
  duracao_media_ms: number | null;
}

export function useAutomacaoEstatisticasPorRegra() {
  return useQuery({
    queryKey: ['automacao-estatisticas-por-regra'],
    queryFn: async (): Promise<RegraEstatistica[]> => {
      const { data, error } = await supabase
        .from('automacao_estatisticas_por_regra')
        .select('*')
        .order('nome');
      if (error) throw error;
      return (data ?? []) as RegraEstatistica[];
    },
    refetchInterval: 30_000,
  });
}

export function useToggleAutomationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('automation_rules').update({ ativo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automacao-estatisticas-por-regra'] });
    },
  });
}

/**
 * Botão "Correr agora": dispara manualmente os scans (expirações de
 * viatura/motorista, renovação de renting, cobranças atrasadas) e o
 * Rule Engine/Executor, em vez de esperar o próximo ciclo do cron.
 * Rate limit de 5 min é imposto no servidor (RPC) — este hook só reflete
 * o erro que vier de lá.
 */
export function useExecutarAutomacoesManualmente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('executar_jobs_automacao_manualmente');
      if (error) throw error;
      return data as { success: boolean; executado_em: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automacao-estatisticas-por-regra'] });
      queryClient.invalidateQueries({ queryKey: ['automacao-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['automation-runs-pendentes'] });
      queryClient.invalidateQueries({ queryKey: ['failed-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['automation-runs-counts'] });
      queryClient.invalidateQueries({ queryKey: ['notification-queue-counts'] });
      queryClient.invalidateQueries({ queryKey: ['domain-events-summary'] });
      queryClient.invalidateQueries({ queryKey: ['automacao-desempenho-7-dias'] });
      queryClient.invalidateQueries({ queryKey: ['automacao-utilizacao'] });
      queryClient.invalidateQueries({ queryKey: ['automacao-saude'] });
      queryClient.invalidateQueries({ queryKey: ['automacao-atividade-14-dias'] });
    },
  });
}

export interface AtividadeDiaria {
  dia: string;
  eventos: number;
  executadas: number;
  falhas: number;
}

export function useAutomacaoAtividade14Dias() {
  return useQuery({
    queryKey: ['automacao-atividade-14-dias'],
    queryFn: async (): Promise<AtividadeDiaria[]> => {
      const desdeIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

      const [eventosRes, logsRes] = await Promise.all([
        supabase.from('domain_events').select('occurred_at').gte('occurred_at', desdeIso),
        supabase.from('automation_logs').select('created_at, evento').gte('created_at', desdeIso),
      ]);
      if (eventosRes.error) throw eventosRes.error;
      if (logsRes.error) throw logsRes.error;

      const dias: AtividadeDiaria[] = [];
      for (let i = 13; i >= 0; i--) {
        const dia = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        dias.push({ dia, eventos: 0, executadas: 0, falhas: 0 });
      }
      const porDia = new Map(dias.map((d) => [d.dia, d]));

      for (const row of eventosRes.data ?? []) {
        const bucket = porDia.get(row.occurred_at.slice(0, 10));
        if (bucket) bucket.eventos += 1;
      }
      for (const row of logsRes.data ?? []) {
        const bucket = porDia.get(row.created_at.slice(0, 10));
        if (!bucket) continue;
        if (row.evento === 'executada') bucket.executadas += 1;
        if (row.evento === 'falhou') bucket.falhas += 1;
      }
      return dias;
    },
    refetchInterval: 60_000,
  });
}

export interface DesempenhoSemanal {
  successRate: number | null;
  duracaoMediaMs: number | null;
}

export function useAutomacaoDesempenho7Dias() {
  return useQuery({
    queryKey: ['automacao-desempenho-7-dias'],
    queryFn: async (): Promise<DesempenhoSemanal> => {
      const desdeIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('automation_logs')
        .select('evento, duracao_ms')
        .gte('created_at', desdeIso);
      if (error) throw error;

      const rows = data ?? [];
      const executadas = rows.filter((r) => r.evento === 'executada');
      const falhas = rows.filter((r) => r.evento === 'falhou').length;
      const total = executadas.length + falhas;
      const duracoes = executadas.map((r) => r.duracao_ms).filter((d): d is number => d !== null);

      return {
        successRate: total > 0 ? executadas.length / total : null,
        duracaoMediaMs:
          duracoes.length > 0 ? duracoes.reduce((a, b) => a + b, 0) / duracoes.length : null,
      };
    },
    refetchInterval: 60_000,
  });
}

export function useAutomacaoUtilizacao() {
  return useQuery({
    queryKey: ['automacao-utilizacao'],
    queryFn: async (): Promise<number | null> => {
      const desdeIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [pendentesRes, concluidosRes] = await Promise.all([
        supabase.from('automation_runs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase
          .from('automation_runs')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .gte('completed_at', desdeIso),
      ]);
      if (pendentesRes.error) throw pendentesRes.error;
      if (concluidosRes.error) throw concluidosRes.error;
      const pendentes = pendentesRes.count ?? 0;
      const concluidos = concluidosRes.count ?? 0;
      const total = pendentes + concluidos;
      return total > 0 ? pendentes / total : 0;
    },
    refetchInterval: 30_000,
  });
}

export interface SaudeCanal {
  canal: string;
  falhasUltimaHora: number;
  enviadosUltimaHora: number;
  tempoRespostaMedioMs: number | null;
}

export interface SaudeGeral {
  bloqueados: number;
  retriesPendentes: number;
  falhasNaoResolvidas: number;
  canais: SaudeCanal[];
}

export function useAutomacaoSaude() {
  return useQuery({
    queryKey: ['automacao-saude'],
    queryFn: async (): Promise<SaudeGeral> => {
      const cincoMinAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const [runsRes, failedRes, canaisRes] = await Promise.all([
        supabase.from('automation_runs').select('status, attempt, started_at'),
        supabase.from('failed_jobs').select('id').eq('resolved', false),
        supabase.from('automacao_saude_canais').select('*'),
      ]);
      if (runsRes.error) throw runsRes.error;
      if (failedRes.error) throw failedRes.error;
      if (canaisRes.error) throw canaisRes.error;

      const runs = runsRes.data ?? [];
      const bloqueados = runs.filter(
        (r) => r.status === 'running' && r.started_at && r.started_at < cincoMinAtras
      ).length;
      const retriesPendentes = runs.filter((r) => r.status === 'pending' && r.attempt > 0).length;

      return {
        bloqueados,
        retriesPendentes,
        falhasNaoResolvidas: (failedRes.data ?? []).length,
        canais: (canaisRes.data ?? []).map((c) => ({
          canal: c.canal ?? '',
          falhasUltimaHora: c.falhas_ultima_hora ?? 0,
          enviadosUltimaHora: c.enviados_ultima_hora ?? 0,
          tempoRespostaMedioMs: c.tempo_resposta_medio_ms,
        })),
      };
    },
    refetchInterval: 30_000,
  });
}

export function useIgnorarFailedJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('ignorar_failed_job', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['failed-jobs'] });
    },
  });
}

export interface AutomationRunPendente {
  id: string;
  job_type: string;
  status: string;
  attempt: number;
  next_attempt_at: string;
  priority: number;
}

export function useAutomationRunsPendentes() {
  return useQuery({
    queryKey: ['automation-runs-pendentes'],
    queryFn: async (): Promise<AutomationRunPendente[]> => {
      const { data, error } = await supabase
        .from('automation_runs')
        .select('id, job_type, status, attempt, next_attempt_at, priority')
        .eq('status', 'pending')
        .order('priority', { ascending: true })
        .order('next_attempt_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AutomationRunPendente[];
    },
    refetchInterval: 15_000,
  });
}

export function useRecentAutomationLogs(limit = 20) {
  return useQuery({
    queryKey: ['recent-automation-logs', limit],
    queryFn: async (): Promise<AutomationLogEntry[]> => {
      const { data, error } = await supabase
        .from('automation_logs')
        .select('id, evento, created_at, automation_rules(nome)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const rule = row.automation_rules as unknown as { nome: string } | { nome: string }[] | null;
        const regra_nome = Array.isArray(rule) ? (rule[0]?.nome ?? null) : (rule?.nome ?? null);
        return { id: row.id, evento: row.evento, created_at: row.created_at, regra_nome };
      });
    },
    refetchInterval: 15_000,
  });
}
