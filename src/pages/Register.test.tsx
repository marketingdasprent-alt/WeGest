import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import Register from '@/pages/Register';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAcceptOrgInvite', () => ({
  useAcceptOrgInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSignInForInvite: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('entrada por convite sem sessão', () => {
  it('valida o token sem ler profiles anónimos e permite entrar para aceitar', async () => {
    vi.mocked(supabase.from).mockImplementation(() => {
      throw new Error('permission denied for table profiles');
    });
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        {
          email: 'titular@example.test',
          cargo_id: null,
          cargo_nome: 'Gestor',
          org_id: 'org-a',
          expires_at: '2030-01-01T00:00:00Z',
          org_nome: 'Premium Ride',
        },
      ],
      error: null,
      status: 200,
      statusText: 'OK',
      count: null,
    } as never);
    render(
      <MemoryRouter initialEntries={['/register?token=convite-valido']}>
        <Register />
      </MemoryRouter>
    );
    // Quem abre o link vê logo quem o convida, antes de criar conta ou entrar.
    expect(await screen.findByText(/Premium Ride/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar para aceitar convite' }));
    expect(await screen.findByLabelText('Palavra-passe da sua conta')).toBeInTheDocument();
    expect(screen.getAllByText(/Premium Ride/).length).toBeGreaterThan(0);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith('validar_convite_token', {
      p_token: 'convite-valido',
    });
  });
});
