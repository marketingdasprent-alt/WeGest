import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: vi.fn() }));

// Captura o `enabled` com que o hook de leitura é chamado: é ele que decide se
// a query e o canal de realtime arrancam.
const useNotificacoes = vi.fn((_enabled: boolean) => ({
  notificacoes: [],
  resolver: vi.fn(),
  totalNaoResolvidas: 0,
  erro: null,
  aCarregar: false,
}));
vi.mock('@/hooks/useNotificacoes', () => ({
  useNotificacoes: (enabled: boolean) => useNotificacoes(enabled),
}));

import { NotificacoesProvider } from './NotificacoesContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';

function montar(rota: string) {
  render(
    <MemoryRouter initialEntries={[rota]}>
      <NotificacoesProvider>
        <span />
      </NotificacoesProvider>
    </MemoryRouter>
  );
  return useNotificacoes.mock.calls.at(-1)?.[0];
}

function comSessao() {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 'u1' } as never,
    session: null,
    loading: false,
    signOut: vi.fn(),
  });
  vi.mocked(usePermissions).mockReturnValue({
    tipoUtilizador: 'colaborador',
    loading: false,
  } as never);
}

describe('NotificacoesProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não lê notificações sem sessão autenticada', () => {
    // A condição anterior era só `tipoUtilizador !== 'motorista'`, verdadeira
    // para um visitante anónimo — nada impedia a subscrição sem sessão.
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: null,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(usePermissions).mockReturnValue({
      tipoUtilizador: 'colaborador',
      loading: false,
    } as never);

    expect(montar('/dashboard')).toBe(false);
  });

  it('com sessão válida, lê nas rotas internas', () => {
    comSessao();
    expect(montar('/dashboard')).toBe(true);
    expect(montar('/viaturas/123')).toBe(true);
  });

  it('NUNCA lê em rotas públicas, mesmo com sessão válida', () => {
    // Era esta a falha: um utilizador autenticado a visitar a landing recebia
    // avisos operacionais — matrículas, contratos, cartas caducadas — sobre uma
    // página pública. O quadro de TV é o caso mais grave: fica projetado.
    comSessao();

    for (const rota of [
      '/',
      '/sobre',
      '/faq',
      '/termos',
      '/privacidade',
      '/cookies',
      '/contactos',
      '/eliminar-conta',
      '/quadro/token-publico',
      '/danos/token-publico',
      '/formulario/abc',
    ]) {
      expect(montar(rota), `${rota} não devia ler notificações`).toBe(false);
    }
  });

  it('não lê para motoristas — têm os seus próprios avisos', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as never,
      session: null,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(usePermissions).mockReturnValue({
      tipoUtilizador: 'motorista',
      loading: false,
    } as never);

    expect(montar('/dashboard')).toBe(false);
  });

  it('espera pela autenticação e pelas permissões antes de ler', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: null,
      loading: true,
      signOut: vi.fn(),
    });
    vi.mocked(usePermissions).mockReturnValue({
      tipoUtilizador: 'colaborador',
      loading: true,
    } as never);

    expect(montar('/dashboard')).toBe(false);
  });
});
