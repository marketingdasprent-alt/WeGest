// Continuação de AutomacaoPage.test.tsx — separado em ficheiro próprio
// para ficar abaixo do limite de linhas do ESLint (max-lines). Cobre a
// tab "Regras" e o modal de configuração; o mock setup é replicado (não
// importado) porque vi.mock() só funciona corretamente por ficheiro.
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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
              nome: 'Regra Estatística Teste',
              event_type: 'viatura.seguro_expirando',
              condicoes: [],
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

/**
 * O "Editor visual" abre na LISTA de automações — o canvas só aparece ao
 * escolher uma. Não é preciso navegar para lá chegar.
 */
function irParaTabelaDeRegras() {
  // Já é a vista por omissão; a função fica para o teste se ler como intenção.
}

/**
 * Clicar numa linha abre a automação no construtor; clicar no bloco de
 * notificação abre o painel de propriedades à direita, que é onde toda a
 * configuração de destinatários vive desde que a Sheet foi absorvida.
 */
async function abrirPainelDaAccao(nome: string): Promise<HTMLElement> {
  irParaTabelaDeRegras();
  await waitFor(() => expect(screen.getByText(nome)).toBeTruthy());
  fireEvent.click(screen.getByText(nome));
  // "Enviar notificação" existe no canvas E na paleta. O que interessa é o
  // do canvas: procura-se pelo wrapper que o React Flow põe à volta do nó.
  // O canvas só tem nós depois de a config da regra chegar. Com a suite toda
  // a correr, o 1s por omissão do waitFor é curto e o teste falhava a meio.
  await waitFor(() => expect(document.querySelectorAll('.rf-node').length).toBeGreaterThan(0), {
    timeout: 5000,
  });
  const noAccao = [...document.querySelectorAll('.rf-node')].find((n) =>
    n.textContent?.includes('Enviar notificação')
  );
  fireEvent.click(noAccao as Element);
  return screen.findByRole('complementary', { name: /Propriedades do passo/i });
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
    irParaTabelaDeRegras();

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
    irParaTabelaDeRegras();

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

  it('o painel abre pré-preenchido com os grupos já configurados', async () => {
    renderPage();
    const painel = await abrirPainelDaAccao('Regra Estatística Teste');

    // Gestores (cargo-1) vem do acao_config mockado: aparece como chip com o
    // seu botão de remover, não na lista dos que ainda se podem juntar.
    // Três queries encadeadas até o chip ter nome: config da regra -> fluxo
    // -> cargos. O 1s por omissão do findBy é curto de mais com a suite toda
    // a correr, e o teste falhava de forma intermitente.
    expect(
      await within(painel).findByRole('button', { name: 'Remover Gestores' }, { timeout: 5000 })
    ).toBeTruthy();
    expect(within(painel).getByRole('button', { name: '+ Financeiro' })).toBeTruthy();
  });

  it('juntar um grupo e guardar escreve os cargo_ids', async () => {
    renderPage();
    const painel = await abrirPainelDaAccao('Regra Estatística Teste');

    fireEvent.click(await within(painel).findByRole('button', { name: '+ Financeiro' }));
    // O Guardar do painel, não o da barra: aplica ao canvas e grava a regra.
    fireEvent.click(within(painel).getByRole('button', { name: /^Guardar$/ }));

    await waitFor(() => {
      expect(capturedUpdatePayload?.acao_config).toMatchObject({
        destinatarios_cargo_ids: expect.arrayContaining(['cargo-1', 'cargo-2']),
      });
    });
  });

  it('escolher pessoas específicas grava destinatarios_modo e user_ids', async () => {
    renderPage();
    const painel = await abrirPainelDaAccao('Regra Estatística Teste');

    // Só aparece depois de os cargos resolverem e haver um grupo escolhido.
    fireEvent.click(
      await within(painel).findByRole('switch', { name: /Escolher pessoas específicas/i })
    );
    fireEvent.click(await within(painel).findByRole('button', { name: /Ana Gestora/ }));
    fireEvent.click(within(painel).getByRole('button', { name: /^Guardar$/ }));

    await waitFor(() => {
      expect(capturedUpdatePayload?.acao_config).toMatchObject({
        destinatarios_modo: 'individual',
        destinatarios_user_ids: ['user-1'],
      });
    });
  });

  it('utilizador só com "Ver" (sem can_edit automacoes) não consegue mexer nos controlos', async () => {
    canEdit.mockReturnValue(false);
    renderPage();

    // O botão "Correr agora" nem chega a renderizar para quem só tem acesso de leitura.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Editor visual' })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /Correr agora/i })).toBeNull();

    irParaTabelaDeRegras();
    await waitFor(() => {
      for (const s of screen.getAllByRole('switch')) expect(s).toBeDisabled();
    });
    // A coluna de acções desapareceu — quem não pode gerir não mexe nos
    // switches, e o construtor não lhe deixa gravar.
    expect(screen.queryByRole('button', { name: /^Configurar$/ })).toBeNull();

    // As acções de resolução vivem agora no histórico consolidado.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Monitorização' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: /Ignorar/i })).toBeDisabled();
  });
});
