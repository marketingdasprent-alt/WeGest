import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { fromMock, rpcMock, toastMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

import { COLUNAS_API_CHAVES, useApiChaves, useCriarApiChave } from './useApiChaves';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  toastMock.mockReset();
});

describe('useApiChaves', () => {
  it('lista por colunas, nunca api_key, api_secret nem api_key_hash', async () => {
    const select = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [{ id: 'k1', prefixo: null }], error: null }),
    });
    fromMock.mockReturnValue({ select });
    const { result } = renderHook(() => useApiChaves(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fromMock).toHaveBeenCalledWith('api_chaves');
    expect(select).toHaveBeenCalledWith(COLUNAS_API_CHAVES);
    const colunas = COLUNAS_API_CHAVES.split(',').map((c) => c.trim());
    expect(colunas).not.toContain('*');
    for (const vedada of ['api_key', 'api_secret', 'api_key_hash']) {
      expect(colunas).not.toContain(vedada);
    }
    expect(result.current.data).toEqual([{ id: 'k1', prefixo: null }]);
  });
});

describe('useCriarApiChave', () => {
  it('sem validade nem whitelist manda null e devolve a chave em claro uma vez', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 'k1', chave: 'wg_ra_abc', prefixo: 'wg_ra_abc' }],
      error: null,
    });
    const { result } = renderHook(() => useCriarApiChave(), { wrapper });
    const criada = await result.current.mutateAsync({
      nome: 'Site',
      escopo: 'rent_a_car',
      permissoes: ['catalogo:read'],
      expiraEm: null,
      ipWhitelist: [],
    });
    expect(rpcMock).toHaveBeenCalledWith('api_chaves_criar', {
      p_nome: 'Site',
      p_escopo: 'rent_a_car',
      p_permissoes: ['catalogo:read'],
      p_expira_em: null,
      p_ip_whitelist: null,
    });
    expect(criada).toEqual({ id: 'k1', chave: 'wg_ra_abc', prefixo: 'wg_ra_abc' });
  });

  it('erro da RPC mostra toast com a mensagem do Supabase', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Só administradores' } });
    const { result } = renderHook(() => useCriarApiChave(), { wrapper });
    await expect(
      result.current.mutateAsync({
        nome: 'X',
        escopo: 'rent_a_car',
        permissoes: ['catalogo:read'],
        expiraEm: null,
        ipWhitelist: ['203.0.113.1'],
      })
    ).rejects.toBeTruthy();
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Só administradores' })
      )
    );
  });
});
