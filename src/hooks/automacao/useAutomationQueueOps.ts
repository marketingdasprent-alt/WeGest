import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function countByStatus(
  table: 'automation_runs' | 'notification_queue'
): Promise<Record<string, number>> {
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
  /** Id da linha que falhou na tabela de origem — junta a falha ao run. */
  source_id: string | null;
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
        .select('id, source_table, source_id, job_type, attempts, last_error, failed_at, resolved')
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
