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
