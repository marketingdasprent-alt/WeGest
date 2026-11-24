import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import ResetPassword from './ResetPassword';

vi.mock('@/lib/native', () => ({
  getPostAuthRoute: () => '/crm',
  getUnauthenticatedRoute: () => '/login',
}));

const SENHA_FORTE = 'Abcdef1234!x';

function montar(url: string) {
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/motorista/painel" element={<p>Painel</p>} />
          <Route path="/crm" element={<p>CRM</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { invalidate };
}

async function preencherEEnviar() {
  fireEvent.change(await screen.findByLabelText('Nova palavra-passe'), {
    target: { value: SENHA_FORTE },
  });
  fireEvent.change(screen.getByLabelText('Confirmar nova palavra-passe'), {
    target: { value: SENHA_FORTE },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Alterar palavra-passe' }));
}

beforeEach(() => {
  // O mock global do client não traz estes dois métodos de auth.
  Object.assign(supabase.auth, { onAuthStateChange: vi.fn(), updateUser: vi.fn() });
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: { user: { id: 'u1' } } },
    error: null,
  } as never);
  vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  } as never);
  vi.mocked(supabase.auth.updateUser).mockResolvedValue({ data: {}, error: null } as never);
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { user_metadata: { tipo_utilizador: 'motorista' } } },
    error: null,
  } as never);
  vi.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as never);
});

describe('ResetPassword com provisoria=1', () => {
  it('mostra o texto de escolher palavra-passe', async () => {
    montar('/reset-password?provisoria=1');
    expect(await screen.findByText('Escolha a sua palavra-passe')).toBeTruthy();
    expect(screen.getByText(/Substitua-a por uma palavra-passe só sua/)).toBeTruthy();
  });

  it('depois de alterar marca a senha como trocada, invalida e segue para o painel', async () => {
    const { invalidate } = montar('/reset-password?provisoria=1');
    await preencherEEnviar();

    expect(await screen.findByText('Painel')).toBeTruthy();
    expect(supabase.rpc).toHaveBeenCalledWith('marcar_senha_provisoria_trocada');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['senha-provisoria'] });
    const ordem = [
      vi.mocked(supabase.auth.updateUser).mock.invocationCallOrder[0],
      vi.mocked(supabase.rpc).mock.invocationCallOrder[0],
    ];
    expect(ordem[0]).toBeLessThan(ordem[1]);
  });

  it('se o updateUser falha não marca como trocada', async () => {
    vi.mocked(supabase.auth.updateUser).mockResolvedValue({
      data: {},
      error: new Error('fraca'),
    } as never);
    montar('/reset-password?provisoria=1');
    await preencherEEnviar();
    await waitFor(() => expect(supabase.auth.updateUser).toHaveBeenCalled());
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('se a marcação falha fica na página', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('rpc') } as never);
    montar('/reset-password?provisoria=1');
    await preencherEEnviar();
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
    expect(screen.queryByText('Painel')).toBeNull();
  });
});

describe('ResetPassword sem provisoria (recuperação)', () => {
  it('mantém o texto e não chama a RPC', async () => {
    montar('/reset-password');
    expect(await screen.findByText('Redefinir palavra-passe')).toBeTruthy();
    await preencherEEnviar();
    expect(await screen.findByText('Painel')).toBeTruthy();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
