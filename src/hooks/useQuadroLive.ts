import { useQuery } from '@tanstack/react-query';
import type { QuadroPayload } from '@/utils/quadroLive.types';
import { supabase } from '@/integrations/supabase/client';

/** Polling do quadro a cada 45s via supabase.functions.invoke (inclui anon apikey). */
export function useQuadroLive(token: string | undefined) {
  return useQuery({
    queryKey: ['quadro-live', token],
    queryFn: async (): Promise<QuadroPayload> => {
      const { data, error } = await supabase.functions.invoke('quadro-live', {
        body: { token },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as QuadroPayload;
    },
    enabled: !!token,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
