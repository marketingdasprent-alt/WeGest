import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockToastFn = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToastFn }),
}));

const mockRpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        if (table === 'automation_runs') {
          return Promise.resolve({
            data: [{ status: 'pending' }, { status: 'pending' }, { status: 'failed' }],
            error: null,
          });
        }
        if (table === 'notification_queue') {
          return Promise.resolve({ data: [{ status: 'sent' }], error: null });
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

  it('mostra as contagens de automation_runs e notification_queue por estado', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Automation Runs')).toBeTruthy();
    });
    expect(screen.getByText('Fila de Notificações')).toBeTruthy();
  });

  it('mostra a lista de falhas por resolver', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('erro de teste')).toBeTruthy();
    });
    expect(screen.getByText('automation_runs')).toBeTruthy();
  });

  it('clicar em "Tentar novamente" chama retry_failed_job e mostra um toast', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('retry_failed_job', { p_id: 'fj-1' });
    });
    expect(mockToastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Reagendado' })
    );
  });
});
