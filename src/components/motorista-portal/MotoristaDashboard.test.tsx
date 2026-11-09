import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MotoristaDashboard } from './MotoristaDashboard';

let motorista: Record<string, unknown> | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, signOut: vi.fn() }),
}));
vi.mock('@/hooks/useMotoristaAtivo', () => ({
  useMotoristaAtivo: () => ({ data: motorista, isLoading: false, error: null }),
}));
vi.mock('@/hooks/useMotoristaTab', () => ({ useMotoristaTab: () => ({ tab: 'inicio' }) }));
vi.mock('./tabs/InicioTab', () => ({ InicioTab: () => <p>Saldo e resumos</p> }));
vi.mock('./tabs/ViaturaTab', () => ({ ViaturaTab: () => null }));
vi.mock('./tabs/ContasTab', () => ({ ContasTab: () => null }));
vi.mock('./tabs/DocumentosTab', () => ({ DocumentosTab: () => null }));

describe('MotoristaDashboard', () => {
  beforeEach(() => {
    motorista = { id: 'm1', status_ativo: true, recibo_verde: true };
  });

  it('ficha ativa mostra o painel', () => {
    render(<MotoristaDashboard />);
    expect(screen.getByText('Saldo e resumos')).toBeTruthy();
  });

  it('ficha inativa não mostra saldo nem resumos, só o aviso', () => {
    motorista = { id: 'm1', status_ativo: false, recibo_verde: true };
    render(<MotoristaDashboard />);
    expect(screen.queryByText('Saldo e resumos')).toBeNull();
    expect(screen.getByText('Ficha inativa')).toBeTruthy();
  });
});
