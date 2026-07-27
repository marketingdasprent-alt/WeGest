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
