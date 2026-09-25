import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRequestAccountRecovery } from './useAdminAccountActions';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('useRequestAccountRecovery', () => {
  it('traduz o 429 do reset-user-password em quanto tempo esperar', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ error: 'Demasiados pedidos.' }), {
          status: 429,
          headers: { 'Retry-After': '600' },
        }),
      },
    } as never);
    const { result } = renderHook(() => useRequestAccountRecovery(), { wrapper });

    await expect(result.current.mutateAsync({ userId: 'u', org_id: 'o' })).rejects.toThrow(
      'Demasiados pedidos. Tente novamente daqui a 10 minutos.'
    );
  });
});
