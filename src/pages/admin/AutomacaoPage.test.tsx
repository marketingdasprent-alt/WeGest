import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockToastFn = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToastFn }),
}));

const mockRpc = vi.fn();

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {
    eq: () => builder,
    gte: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        if (table === 'automation_runs') {
          return chainable({
            data: [{ status: 'pending' }, { status: 'pending' }, { status: 'failed' }],
            count: 2,
            error: null,
          });
        }
        if (table === 'notification_queue') {
          return chainable({ data: [{ status: 'sent' }], error: null });
        }
        if (table === 'domain_events') {
          return chainable({
            data: [
              { processed_at: '2026-07-27T08:00:00.000Z', occurred_at: '2026-07-27T08:00:00.000Z' },
              { processed_at: null, occurred_at: '2026-07-27T09:00:00.000Z' },
            ],
            error: null,
          });
        }
        if (table === 'notifications') {
          return chainable({
            data: [
              { lida: false, resolvida: false },
              { lida: true, resolvida: true },
            ],
            error: null,
          });
        }
        if (table === 'automation_logs') {
          return chainable({
            data: [
              {
                id: 'log-1',
                evento: 'executada',
                created_at: '2026-07-27T08:00:00.000Z',
                duracao_ms: 2500,
                automation_rules: { nome: 'Regra de Teste' },
              },
            ],
            error: null,
          });
        }
        if (table === 'automacao_saude_canais') {
          return chainable({ data: [], error: null });
        }
        // failed_jobs — encadeia .eq().order()
        return {
          eq: vi.fn().mockReturnThis(),
          order: vi.fn(() =>
            Promise.resolve({
              data: [
                {
                  id: 'fj-1',
                  source_table: 'automation_runs',
                  job_type: 'automation_rule',
                  attempts: 3,
                  last_error: 'erro de teste',
                  failed_at: '2026-07-20T10:00:00.000Z',
                  resolved: false,
                },
              ],
              error: null,
            })
          ),
        };
      }),
    })),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import AutomacaoPage from './AutomacaoPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AutomacaoPage />
    </QueryClientProvider>
  );
}

describe('AutomacaoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('mostra as tabs do painel e os cartões da Visão Geral', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Visão Geral' })).toBeTruthy();
    });
    expect(screen.getByRole('tab', { name: 'Atividade' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Fila' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Falhas' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Regras' })).toBeTruthy();
    expect(screen.getByText('Success Rate')).toBeTruthy();
    expect(screen.getByText('Utilização')).toBeTruthy();
  });

  it('mostra os cartões de Estado Geral e Saúde do Sistema', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Automation Runs')).toBeTruthy();
    });
    expect(screen.getByText('Event Bus')).toBeTruthy();
    expect(screen.getAllByText('Falhas').length).toBeGreaterThan(0);
    expect(screen.getByText('Jobs bloqueados')).toBeTruthy();
    expect(screen.getByText('APIs indisponíveis')).toBeTruthy();
  });
});
