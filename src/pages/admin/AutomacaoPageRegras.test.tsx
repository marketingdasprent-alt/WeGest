// Continuação de AutomacaoPage.test.tsx — separado em ficheiro próprio
// para ficar abaixo do limite de linhas do ESLint (max-lines). Cobre a
// tab "Regras" e o ConfigurarRegraSheet; o mock setup é replicado (não
// importado) porque vi.mock() só funciona corretamente por ficheiro.
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/components/ui/select', () => {
  const React = require('react');
  return {
    Select: ({ value, onValueChange, children }: any) => (
      <div data-testid="select-root" data-value={value}>
        {React.Children.map(children, (child: ReactNode) =>
          React.cloneElement(child as any, { _value: value, _onValueChange: onValueChange })
        )}
      </div>
    ),
    SelectTrigger: ({ children, ...props }: any) => (
      <button type="button" role="combobox" {...props}>
        {children}
      </button>
    ),
    SelectValue: ({ _value, placeholder }: any) => <span>{_value || placeholder}</span>,
    SelectContent: ({ children, _onValueChange }: any) => (
      <div role="listbox">
        {React.Children.map(children, (child: ReactNode) =>
          React.cloneElement(child as any, { _onValueChange })
        )}
      </div>
    ),
    SelectItem: ({ value, children, _onValueChange }: any) => (
      <button
        type="button"
        role="option"
        data-value={value}
        onClick={() => _onValueChange?.(value)}
      >
        {children}
      </button>
    ),
  };
});

beforeAll(() => {
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

const canEdit = vi.fn();
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canEdit }) }));

const mockRpc = vi.fn();
let capturedUpdatePayload: Record<string, unknown> | null = null;

function chainable(result: unknown) {
  const builder: Record<string, unknown> = {
    eq: () => builder,
    gte: () => builder,
    order: () => builder,
    limit: () => builder,
    in: () => builder,
    single: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      update: vi.fn((payload: unknown) => ({
        eq: vi.fn(() => {
          if (table === 'automation_rules')
            capturedUpdatePayload = payload as Record<string, unknown>;
          return Promise.resolve({ error: null });
        }),
      })),
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
            ],
            count: 1,
            error: null,
          });
        }
        if (table === 'notification_queue') {
          return chainable({ data: [{ status: 'sent' }], error: null });
        }
        if (table === 'cargos') {
          return chainable({
            data: [
              { id: 'cargo-1', nome: 'Gestores' },
              { id: 'cargo-2', nome: 'Financeiro' },
            ],
            error: null,
          });
        }
        if (table === 'user_organizacoes') {
          return chainable({
            data: [
              { user_id: 'user-1', cargo_id: 'cargo-1' },
              { user_id: 'user-2', cargo_id: 'cargo-1' },
            ],
            error: null,
          });
        }
        if (table === 'profiles') {
          return chainable({
            data: [
              { id: 'user-1', nome: 'Ana Gestora', email: 'ana@exemplo.pt' },
              { id: 'user-2', nome: 'Bruno Gestor', email: 'bruno@exemplo.pt' },
            ],
            error: null,
          });
        }
        if (table === 'automation_rules') {
          return chainable({
            data: {
              id: 'rule-1',
              acao_config: {
                template_codigo: 'teste',
                titulo: 'Regra Estatística Teste',
                destinatarios_estrategia: 'cargo',
                destinatarios_cargo_ids: ['cargo-1'],
                enviar_email: false,
              },
              cooldown_minutos: 1440,
            },
            error: null,
          });
        }
        if (table === 'domain_events') {
          return chainable({ data: [], error: null });
        }
        if (table === 'notifications') {
          return chainable({ data: [], error: null });
        }
        if (table === 'automation_logs') {
          return chainable({ data: [], error: null });
        }
        if (table === 'automacao_saude_canais') {
          return chainable({ data: [], error: null });
        }
        if (table === 'automacao_timeline_recente') {
          return chainable({ data: [], error: null });
        }
        if (table === 'automacao_estatisticas_por_regra') {
          return chainable({
            data: [
              {
                rule_id: 'rule-1',
                nome: 'Regra Estatística Teste',
                event_type: 'viatura.seguro_expirando',
                ativo: true,
                cooldown_minutos: 1440,
                execucoes: 5,
                falhas: 1,
                ultima_execucao: '2026-07-27T08:00:00.000Z',
                duracao_media_ms: 2500,
              },
              {
                rule_id: 'rule-2',
                nome: 'Nova cobrança gerada',
                event_type: 'cobranca.gerada',
                ativo: true,
                cooldown_minutos: 0,
                execucoes: 1,
                falhas: 0,
                ultima_execucao: '2026-07-27T08:00:00.000Z',
                duracao_media_ms: 1200,
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

describe('AutomacaoPage — Regras e permissões', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedUpdatePayload = null;
    mockRpc.mockResolvedValue({ data: null, error: null });
    canEdit.mockReturnValue(true);
  });

  it('mostra estatísticas por regra e permite ligar/desligar', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Regras' }));

    await waitFor(() => {
      expect(screen.getByText('Regra Estatística Teste')).toBeTruthy();
    });

    const switchRegra = screen.getAllByRole('switch')[0];
    fireEvent.click(switchRegra);

    await waitFor(() => {
      expect(mockToastFn).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Regra desligada' })
      );
    });
  });

  it('filtra as regras por módulo (derivado do event_type)', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Regras' }));

    await waitFor(() => {
      expect(screen.getByText('Regra Estatística Teste')).toBeTruthy();
    });
    expect(screen.getByText('Nova cobrança gerada')).toBeTruthy();

    fireEvent.click(screen.getByRole('option', { name: 'Financeiro' }));

    await waitFor(() => {
      expect(screen.queryByText('Regra Estatística Teste')).toBeNull();
    });
    expect(screen.getByText('Nova cobrança gerada')).toBeTruthy();
  });

  it('abre o editor "Configurar" pré-preenchido e guarda a nova configuração', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Regras' }));

    await waitFor(() => {
      expect(screen.getByText('Regra Estatística Teste')).toBeTruthy();
    });

    const botoesConfigurar = screen.getAllByRole('button', { name: /Configurar/i });
    fireEvent.click(botoesConfigurar[0]);

    await waitFor(() => {
      expect(screen.getByText(/Configurar: Regra Estatística Teste/)).toBeTruthy();
    });

    fireEvent.click(await screen.findByRole('button', { name: /Guardar/i }));

    await waitFor(() => {
      expect(mockToastFn).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Configuração guardada' })
      );
    });
  });

  it('mostra os cargos como botões e grava os cargo_ids escolhidos ao guardar', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Regras' }));

    await waitFor(() => {
      expect(screen.getByText('Regra Estatística Teste')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Configurar/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/Configurar: Regra Estatística Teste/)).toBeTruthy();
    });

    // Gestores (cargo-1) já vem selecionado pelo acao_config mockado.
    expect(await screen.findByRole('button', { name: 'Gestores', pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Financeiro', pressed: false })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Financeiro', pressed: false }));
    fireEvent.click(await screen.findByRole('button', { name: /Guardar/i }));

    await waitFor(() => {
      expect(mockToastFn).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Configuração guardada' })
      );
    });

    expect(capturedUpdatePayload?.acao_config).toMatchObject({
      destinatarios_estrategia: 'cargo',
      destinatarios_cargo_ids: expect.arrayContaining(['cargo-1', 'cargo-2']),
    });
  });

  it('liga "Escolher pessoas específicas" e grava destinatarios_modo/user_ids', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Regras' }));

    await waitFor(() => {
      expect(screen.getByText('Regra Estatística Teste')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Configurar/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/Configurar: Regra Estatística Teste/)).toBeTruthy();
    });

    await screen.findByRole('button', { name: 'Gestores', pressed: true });

    // "Escolher pessoas específicas" é o 1.º switch (o 2.º é "Enviar também por email").
    fireEvent.click(screen.getAllByRole('switch')[0]);

    expect(await screen.findByRole('button', { name: /Ana Gestora/, pressed: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ana Gestora/, pressed: false }));

    fireEvent.click(await screen.findByRole('button', { name: /Guardar/i }));

    await waitFor(() => {
      expect(mockToastFn).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Configuração guardada' })
      );
    });

    expect(capturedUpdatePayload?.acao_config).toMatchObject({
      destinatarios_modo: 'individual',
      destinatarios_user_ids: ['user-1'],
    });
  });

  it('utilizador só com "Ver" (sem can_edit automacoes) não consegue mexer nos controlos', async () => {
    canEdit.mockReturnValue(false);
    renderPage();

    // O botão "Correr agora" nem chega a renderizar para quem só tem acesso de leitura.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Visão Geral' })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /Correr agora/i })).toBeNull();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Regras' }));
    await waitFor(() => {
      for (const s of screen.getAllByRole('switch')) expect(s).toBeDisabled();
    });
    for (const b of screen.getAllByRole('button', { name: /Configurar/i }))
      expect(b).toBeDisabled();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Falhas' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: /Ignorar/i })).toBeDisabled();
  });
});
