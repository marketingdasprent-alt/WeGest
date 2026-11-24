import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSenhaProvisoria } from './useSenhaProvisoria';

// Sem retry:false aqui de propósito: o próprio hook tem de o garantir.
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('useSenhaProvisoria', () => {
  it('devolve a linha por trocar', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ por_trocar: true, expira_em: '2026-11-27T10:00:00Z' }],
      error: null,
    } as never);
    const { result } = renderHook(() => useSenhaProvisoria(), { wrapper });
    await waitFor(() => expect(result.current.data?.por_trocar).toBe(true));
  });

  it('erro da RPC (ex.: migração por aplicar) dá null logo, sem repetir', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(supabase.rpc).mockClear();
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function' },
    } as never);
    const { result } = renderHook(() => useSenhaProvisoria(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
});
