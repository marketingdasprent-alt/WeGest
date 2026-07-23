import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────
// Must be defined before importing Dashboard. vi.mock is hoisted automatically.

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: vi.fn(),
}));

vi.mock('@/hooks/useDashboardVariant', () => ({
  useDashboardVariant: vi.fn(),
}));

vi.mock('@/contexts/TenantContext', () => ({
  useOrgId: () => null,
}));

// toast tem de ser uma referência ESTÁVEL entre renders (tal como no hook
// real, que expõe uma função module-level) — caso contrário o fetchData
// (useCallback com `toast` nas deps) muda de identidade a cada render e o
// useEffect que o dispara entra num loop infinito de re-fetch, tornando os
// testes instáveis (timing-dependent).
const mockToastFn = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToastFn }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/hooks/useViaturasOcupacao', () => ({
  fetchViaturasOcupacao: vi.fn().mockResolvedValue(new Map()),
}));

// AtividadeChart é lazy-loaded e usa recharts (~400KB) — mock simples.
vi.mock('@/components/dashboard/AtividadeChart', () => ({
  default: () => <div data-testid="atividade-chart-mock" />,
}));

vi.mock('@/components/dashboard/CheckinCheckoutHistoricoCard', () => ({
  CheckinCheckoutHistoricoCard: () => null,
}));

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => null,
}));

// Supabase mock: chainable + thenable. Cada método retorna o próprio proxy
// (para encadear .select().eq().neq()...) e o proxy é thenable (resolve com
// { data: null, error: null, count: 0 }).
// NOTA: os métodos de cadeia (select, eq, ...) usam funções reais em vez de
// vi.fn() porque vi.clearAllMocks() quebra o encadeamento (limpa a resposta
// do vi.fn fazendo-o retornar undefined). from/rpc precisam de vi.fn() para
// que o import.meta.vitest consiga fazer spy.
vi.mock('@/integrations/supabase/client', () => {
  const result = { data: null, error: null, count: 0 };
  const proxy: Record<string, unknown> = {};
  const methods = [
    'select',
    'eq',
    'neq',
    'not',
    'lte',
    'gte',
    'in',
    'order',
    'or',
    'single',
    'limit',
    'range',
    'ilike',
    'like',
  ];
  for (const m of methods) {
    proxy[m] = () => proxy;
  }
  proxy.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return {
    supabase: {
      from: vi.fn(() => proxy),
      rpc: vi.fn(() => proxy),
      auth: { getSession: vi.fn() },
    },
  };
});

// ── Imports (após mocks) ──────────────────────────────────────────────────────

import Dashboard from './Dashboard';
import { usePermissions } from '@/hooks/usePermissions';
import { useDashboardVariant } from '@/hooks/useDashboardVariant';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  // Radix UI (Select) precisa de ResizeObserver no jsdom.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

function mockPermissions(opts: { isAdmin: boolean; cargo: string | null }) {
  vi.mocked(usePermissions).mockReturnValue({
    isAdmin: opts.isAdmin,
    cargo: opts.cargo,
    cargo_id: null,
    tipoUtilizador: 'colaborador' as const,
    hasRole: vi.fn(() => opts.isAdmin),
    hasPermission: vi.fn(() => false),
    canEdit: vi.fn(() => false),
    hasAccessToResource: vi.fn(() => false),
    podeVerTodosRenting: opts.isAdmin,
    loading: false,
    roles: opts.isAdmin ? ['admin' as const] : [],
    recursos: [],
    recursosEditaveis: [],
  });
}

function mockVariant(variant: 'executivo' | 'operacional') {
  vi.mocked(useDashboardVariant).mockReturnValue({
    variant,
    role: variant === 'executivo' ? 'admin' : 'operacional',
    isExecutivo: variant === 'executivo',
    isOperacional: variant === 'operacional',
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Dashboard — variantes por papel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('variante Executiva mostra cards financeiros (Candidatos, Rentabilidade, Upgrades, Trocas)', async () => {
    mockPermissions({ isAdmin: true, cargo: 'Administrador' });
    mockVariant('executivo');

    render(<Dashboard />);

    // Esperar que o loading termine e o conteúdo principal apareça.
    await waitFor(() => {
      expect(screen.getByText('Disponíveis')).toBeTruthy();
    });

    // KPI de Candidatos — só executivo
    expect(screen.getByText('Candidatos')).toBeTruthy();

    // Título do card com Rentabilidade
    expect(screen.getByText('Atividade & Rentabilidade')).toBeTruthy();

    // KPI de renda contratada
    expect(screen.getByText('nova renda contratada')).toBeTruthy();

    // Cards financeiros
    expect(screen.getByText('Upgrades / Downgrades')).toBeTruthy();
    expect(screen.getByText('Trocas de Viatura')).toBeTruthy();
  });

  it('variante Operacional esconde cards financeiros mas mostra frota + alertas', async () => {
    mockPermissions({ isAdmin: false, cargo: 'colaborador' });
    mockVariant('operacional');

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Disponíveis')).toBeTruthy();
    });

    // Frota — sempre visível
    expect(screen.getByText('Disponíveis')).toBeTruthy();
    expect(screen.getByText('Ocupadas')).toBeTruthy();
    expect(screen.getByText('Em Reparação')).toBeTruthy();

    // Alertas de compliance — sempre visíveis
    expect(screen.getByText('Extintores a Expirar')).toBeTruthy();
    expect(screen.getByText('Contratos a Renovar')).toBeTruthy();

    // ── Cards financeiros NÃO devem aparecer ──
    expect(screen.queryByText('Candidatos')).toBeNull();
    expect(screen.queryByText('Atividade & Rentabilidade')).toBeNull();
    expect(screen.queryByText('nova renda contratada')).toBeNull();
    expect(screen.queryByText('Upgrades / Downgrades')).toBeNull();
    expect(screen.queryByText('Trocas de Viatura')).toBeNull();
  });

  it('variante Operacional mostra título "Atividade" (sem Rentabilidade)', async () => {
    mockPermissions({ isAdmin: false, cargo: 'colaborador' });
    mockVariant('operacional');

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Disponíveis')).toBeTruthy();
    });

    // O título deve ser "Atividade" e não "Atividade & Rentabilidade" — em
    // waitFor porque este título depende de isExecutivo assentar no mesmo
    // commit que "Disponíveis" (mesma fonte, mas React pode ainda re-render
    // entre os dois em CI mais lento); os outros testes já ficam estáveis
    // porque "Disponíveis" e a sua própria asserção partilham o commit inicial.
    await waitFor(() => {
      expect(screen.queryByText('Atividade & Rentabilidade')).toBeNull();
      expect(screen.getByText('Atividade')).toBeTruthy();
    });
  });
});

describe('Dashboard — intervalo de datas personalizado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('botão "Personalizado" abre um calendário de intervalo (não fica só nos presets)', async () => {
    mockPermissions({ isAdmin: true, cargo: 'Administrador' });
    mockVariant('executivo');

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Disponíveis')).toBeTruthy();
    });

    const trigger = screen.getByRole('button', { name: /Personalizado/i });
    fireEvent.click(trigger);

    // O DayPicker (modo range) desenha uma grelha de dias — confirma que o
    // calendário chegou a montar, não só que o botão existe.
    await waitFor(() => {
      expect(document.querySelector('table')).toBeTruthy();
    });
  });
});
