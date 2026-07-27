import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

beforeAll(() => {
  // O gráfico "Atividade — últimos 14 dias" usa o ResponsiveContainer do
  // recharts, que precisa de ResizeObserver — inexistente no jsdom.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

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
            data: [
              {
                id: 'run-a',
                status: 'pending',
                attempt: 0,
                job_type: 'automation_rule',
                next_attempt_at: '2026-07-27T09:00:00.000Z',
                priority: 5,
                started_at: null,
              },
              {
                id: 'run-b',
                status: 'pending',
                attempt: 1,
                job_type: 'automation_rule',
                next_attempt_at: '2026-07-27T09:05:00.000Z',
                priority: 5,
                started_at: null,
              },
            ],
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
        if (table === 'automacao_timeline_recente') {
          return chainable({
            data: [
              {
                event_id: 'evt-1',
                event_type: 'viatura.seguro_expirando',
                occurred_at: '2026-07-27T08:00:00.000Z',
                entity_table: 'viaturas',
                entity_id: 'v-1',
                run_id: 'run-1',
                rule_id: 'rule-1',
                regra_nome: 'Regra de Teste',
                run_status: 'completed',
                started_at: '2026-07-27T07:59:58.000Z',
                completed_at: '2026-07-27T08:00:00.000Z',
                attempt: 1,
                ultimo_evento_log: 'executada',
                duracao_ms: 2000,
                detalhe: { notificacoes_criadas: 3, emails_enviados: 1 },
              },
            ],
            error: null,
          });
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

  it('mostra a timeline de atividade e abre o drill-down de uma execução', async () => {
    renderPage();
    // Radix Tabs ativa a tab no mousedown, não no click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Atividade' }));

    await waitFor(() => {
      expect(screen.getByText('Regra de Teste')).toBeTruthy();
    });
    expect(screen.getByText(/3 notif\. · 1 email/)).toBeTruthy();

    fireEvent.click(screen.getByText('Regra de Teste'));
    await waitFor(() => {
      expect(screen.getByText('Histórico de execução')).toBeTruthy();
    });
  });

  it('mostra a fila de processamento pendente', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Fila' }));

    await waitFor(() => {
      expect(screen.getAllByText('automation_rule').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Prioridade')).toBeTruthy();
  });

  it('clicar em "Ignorar" chama ignorar_failed_job', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Falhas' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ignorar/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Ignorar/i }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('ignorar_failed_job', { p_id: 'fj-1' });
    });
    expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ignorado' }));
  });

  it('clicar em "Ver detalhes" mostra o erro completo', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Falhas' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ver detalhes/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/i }));

    await waitFor(() => {
      expect(screen.getByText('Detalhes da falha')).toBeTruthy();
    });
    expect(screen.getAllByText(/erro de teste/).length).toBeGreaterThan(0);
  });

  it('clicar em "Tentar novamente" chama retry_failed_job e mostra um toast', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Falhas' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('retry_failed_job', { p_id: 'fj-1' });
    });
    expect(mockToastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Reagendado' }));
  });
});
