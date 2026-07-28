import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ────────────────────────────────────────────────────────────────────
// Must be defined before importing Dashboard. vi.mock is hoisted automatically.

vi.mock('@/hooks/useDashboardVariant', () => ({
  useDashboardVariant: vi.fn(),
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

// `navigate` tem de ser uma referência ESTÁVEL entre renders (senão os
// KpiItem, que o usam no onClick, mudavam de handler a cada render) e permite
// asserir para onde cada KPI navega.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/useViaturasOcupacao', () => ({
  fetchViaturasOcupacao: vi.fn().mockResolvedValue(new Map()),
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
import { useDashboardVariant } from '@/hooks/useDashboardVariant';
import { supabase } from '@/integrations/supabase/client';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // O gráfico "Atividade" usa o ResponsiveContainer do recharts, que precisa
  // de ResizeObserver — inexistente no jsdom.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

function mockVariant(variant: 'executivo' | 'operacional') {
  vi.mocked(useDashboardVariant).mockReturnValue({
    variant,
    role: variant === 'executivo' ? 'admin' : 'operacional',
    isExecutivo: variant === 'executivo',
    isOperacional: variant === 'operacional',
  });
}

// Proxy chainable/thenable — usado para reconstruir o comportamento
// por-defeito depois de um teste sobrepor `supabase.from` para uma tabela
// específica.
function makeGenericProxy(result: unknown = { data: null, error: null, count: 0 }) {
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
  return proxy;
}

/** Faz `supabase.from('contratos')` devolver `count` contratos já expirados
 *  (para popular a categoria "Contratos" em "Precisa de atenção") — todas
 *  as outras tabelas mantêm o comportamento por-defeito. */
function mockContratosExpirados(count: number) {
  const contratosData = Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    numero_contrato: i + 1,
    data_inicio: '2020-01-01',
    data_fim: '2020-01-02',
    duracao_meses: 12,
    motorista_nome: `Motorista ${i}`,
    motorista_id: `m${i}`,
    viatura_id: `v${i}`,
    criado_em: '2020-01-01T09:00:00.000Z',
    viaturas: { matricula: 'AA-00-AA' },
  }));
  const contratosProxy = makeGenericProxy({ data: contratosData, error: null, count });
  const generico = makeGenericProxy();

  vi.mocked(supabase.from).mockImplementation(((table: string) =>
    table === 'contratos' ? contratosProxy : generico) as unknown as typeof supabase.from);
}

/** Faz `supabase.from('contrato_cobrancas')` devolver uma cobrança emitida
 *  há mais de 30 dias sem pagamentos — para popular a categoria
 *  "Cobranças" via `useContasAReceber`. */
function mockCobrancaEmAberto() {
  const emitidaEm = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const cobrancasProxy = makeGenericProxy({
    data: [
      {
        id: 'cob1',
        valor_total: 250,
        emitida_em: emitidaEm,
        destinatario_nome: 'Cliente Teste',
        contrato_id: null,
      },
    ],
    error: null,
    count: 1,
  });
  const generico = makeGenericProxy();

  vi.mocked(supabase.from).mockImplementation(((table: string) =>
    table === 'contrato_cobrancas' ? cobrancasProxy : generico) as unknown as typeof supabase.from);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Homepage — KPIs, estado da frota, atenção, atividade, check-in/check-out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restaura o comportamento por-defeito de `from` — alguns testes
    // sobrepõem-no com mockContratosExpirados()/mockCobrancaEmAberto().
    vi.mocked(supabase.from).mockImplementation((() =>
      makeGenericProxy()) as unknown as typeof supabase.from);
  });

  it('mostra os 5 indicadores de frota, clicáveis, sem dados financeiros', async () => {
    mockVariant('executivo');

    renderDashboard();

    await waitFor(() => {
      // "Disponíveis" aparece 2x: o KPI e a legenda do donut "Estado da Frota".
      expect(screen.getAllByText('Disponíveis').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Alugadas')).toBeTruthy();
    expect(screen.getByText('Reservadas')).toBeTruthy();
    expect(screen.getByText('Em Oficina')).toBeTruthy();
    expect(screen.getByText('Ocupação')).toBeTruthy();

    // Cada KPI é um botão real (navegável), não um display estático.
    expect(screen.getByRole('button', { name: /Disponíveis/i })).toBeTruthy();
  });

  it('cada KPI de frota navega para Viaturas já filtrado pelo estado certo', async () => {
    mockVariant('executivo');

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Disponíveis/i })).toBeTruthy();
    });

    const casos: [RegExp, string][] = [
      [/Disponíveis/i, '/viaturas?status=disponivel'],
      [/Alugadas/i, '/viaturas?status=alugadas'],
      [/Reservadas/i, '/viaturas?status=em_reserva'],
      [/Em Oficina/i, '/viaturas?status=manutencao'],
      [/Ocupação/i, '/viaturas?status=em_uso'],
    ];

    for (const [nome, destino] of casos) {
      mockNavigate.mockClear();
      fireEvent.click(screen.getByRole('button', { name: nome }));
      expect(mockNavigate).toHaveBeenCalledWith(destino);
    }
  });

  it('"Estado da Frota" mostra o donut com as 3 fatias (inclui inativas)', async () => {
    mockVariant('executivo');

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Estado da Frota')).toBeTruthy();
    });
    // O donut é lazy — espera que o chunk resolva antes de ler a legenda.
    // Timeout alargado (também no it() abaixo): sob a suite completa
    // (muitos ficheiros em paralelo), a resolução do import dinâmico +
    // render do recharts pode ultrapassar os 5s por-defeito do Vitest.
    await waitFor(
      () => {
        expect(screen.getByText('Ocupados')).toBeTruthy();
      },
      { timeout: 12000 }
    );
    expect(screen.getByText('Inativos')).toBeTruthy();
  }, 15000);

  it('mostra "Histórico Check-in / Check-out" e o cartão "Car Track"', async () => {
    mockVariant('executivo');

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Histórico Check-in / Check-out')).toBeTruthy();
    });
    // Car Track deixou de ser placeholder — passou a ser o mapa (CartrackMapCard),
    // que renderiza sempre o título no cabeçalho, seja qual for o estado.
    expect(screen.getByText('Car Track')).toBeTruthy();
  });

  it('"Precisa de atenção" mostra o estado positivo quando não há nada', async () => {
    mockVariant('executivo');

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Precisa de atenção')).toBeTruthy();
    });
    expect(screen.getByText('Tudo em ordem')).toBeTruthy();
    expect(screen.getByText('Nada precisa da tua atenção hoje.')).toBeTruthy();
  });

  it('"Precisa de atenção" categoriza um contrato expirado como linha clicável', async () => {
    mockVariant('executivo');
    mockContratosExpirados(1);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Contratos')).toBeTruthy();
    });
    expect(screen.getByText(/expirou há/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Contratos/i })).toBeTruthy();
  });

  it('"Precisa de atenção" mostra a categoria Cobranças só na variante Executiva', async () => {
    mockVariant('executivo');
    mockCobrancaEmAberto();

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Cobranças')).toBeTruthy();
    });
  });

  it('variante Operacional: "Precisa de atenção" nunca mostra Cobranças', async () => {
    mockVariant('operacional');
    mockCobrancaEmAberto();

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Precisa de atenção')).toBeTruthy();
    });
    expect(screen.queryByText('Cobranças')).toBeNull();
  });

  it('secção "Atividade" mostra o gráfico com legenda e o seletor de período', async () => {
    mockVariant('executivo');

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Atividade' })).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /Este Mês/i })).toBeTruthy();
    expect(screen.getByText('Alugados')).toBeTruthy();
    expect(screen.getByText('Devolvidos')).toBeTruthy();
  });

  it('o período é o único controlo do gráfico — a granularidade não é escolhida à mão', async () => {
    mockVariant('executivo');

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Atividade' })).toBeTruthy();
    });
    // Não há um segundo controlo de tempo a duplicar o seletor de período.
    expect(screen.queryByRole('button', { name: 'Dia' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Semana' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mês' })).toBeNull();
  });

  it('não mostra hero de saudação nem os atalhos antigos', async () => {
    mockVariant('executivo');

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('Disponíveis').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Bom dia|Boa tarde|Boa noite/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Nova Reserva/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ver Faturação/i })).toBeNull();
  });

  it('seletor de período do gráfico oferece os presets e o intervalo personalizado', async () => {
    mockVariant('executivo');

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Atividade' })).toBeTruthy();
    });

    // O gatilho mostra o período activo — "Este Mês" por omissão.
    fireEvent.click(screen.getByRole('button', { name: /Este Mês/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Trimestre' })).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Esta Semana' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Este Ano' })).toBeTruthy();
    expect(screen.getByText('Intervalo personalizado')).toBeTruthy();
  });

  it('mudar de período não faz a homepage desaparecer — só o gráfico espera', async () => {
    mockVariant('executivo');

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('Disponíveis').length).toBeGreaterThan(0);
    });

    // Segura o fetch seguinte: com o mock a resolver de imediato, a janela de
    // loading era invisível e o teste passava mesmo com o bug.
    let libertar!: () => void;
    const emEspera = new Promise<void>((resolve) => {
      libertar = resolve;
    });
    vi.mocked(supabase.from).mockImplementation((() =>
      makeGenericProxy(
        emEspera.then(() => ({ data: null, error: null, count: 0 }))
      )) as unknown as typeof supabase.from);

    fireEvent.click(screen.getByRole('button', { name: /Este Mês/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Trimestre' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trimestre' }));

    // Com o fetch do trimestre ainda pendente, os KPIs e o gráfico continuam
    // montados — o DashboardSkeleton não renderiza nenhum destes textos, por
    // isso encontrá-los prova que a página não foi trocada por ele.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Trimestre/i })).toBeTruthy();
    });
    expect(screen.getAllByText('Disponíveis').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Atividade' })).toBeTruthy();

    libertar();
    await waitFor(() => {
      expect(screen.getAllByText('Disponíveis').length).toBeGreaterThan(0);
    });
  });

  it('escolher um preset fecha o popover e passa a mostrá-lo no botão', async () => {
    mockVariant('executivo');

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Atividade' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Este Mês/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Trimestre' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trimestre' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Este Mês/i })).toBeNull();
    });
    expect(screen.getByRole('button', { name: /Trimestre/i })).toBeTruthy();
  });
});
