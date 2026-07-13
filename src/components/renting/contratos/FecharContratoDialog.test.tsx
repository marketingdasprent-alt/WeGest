import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mocks (hoisted) ──────────────────────────────────────────────────────────

// Supabase mock: chainable + Promise real. Cada método retorna a própria
// Promise (para encadear .select().eq().in()...) e a Promise resolve com
// { data: null, error: null, count: 0 }. Usar uma Promise real (em vez de
// thenable proxy) evita edge-cases de resolução do motor JS. Override do
// mock básico do setup.ts.
vi.mock('@/integrations/supabase/client', () => {
  const result = { data: null, error: null, count: 0 };
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
    'maybeSingle',
    'limit',
    'range',
    'ilike',
    'like',
    'insert',
    'update',
    'delete',
    'upsert',
  ];

  // Cria uma Promise real com os métodos encadeáveis anexados. `await` usa
  // o `then` nativo do Promise — sem proxy thenable, sem ambiguidade.
  function createChainable(): Promise<typeof result> {
    const p = Promise.resolve(result);
    for (const m of methods) {
      (p as unknown as Record<string, unknown>)[m] = vi.fn(() => p);
    }
    return p;
  }

  return {
    supabase: {
      from: vi.fn(() => createChainable()),
      rpc: vi.fn(() => createChainable()),
      auth: { getSession: vi.fn() },
    },
  };
});

const mockMutateAsync = vi.fn().mockResolvedValue({ fechouAgora: true });
vi.mock('@/hooks/useContratosRenting', () => ({
  useFecharContrato: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

// A referência do array `data` tem de ser estável entre renders — o componente
// tem um useEffect com dependência em `estacoes`; se o mock devolver um novo
// array a cada render, o useEffect dispara em loop infinito (form.reset →
// re-render → novo array → useEffect → ...).
vi.mock('@/hooks/useEstacoes', () => {
  const estacoes = [
    { id: 'est-1', nome: 'Lisboa', morada: null, cidade: 'Lisboa', ativa: true },
    { id: 'est-2', nome: 'Porto', morada: null, cidade: 'Porto', ativa: true },
  ];
  return { useEstacoes: () => ({ data: estacoes }) };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'gestor@wegest.pt', user_metadata: { nome: 'Gestor Teste' } },
  }),
}));

// AssinaturasHandoverSection usa canvas + Supabase — mock simples.
vi.mock('@/components/assinatura/AssinaturasHandoverSection', () => ({
  AssinaturasHandoverSection: React.forwardRef<
    { getAssinaturas: () => { motorista: null; responsavel: null } },
    { motoristaNome: string; responsavelNome: string }
  >((_props, _ref) => (
    <div data-testid="assinaturas-mock">Assinaturas (mock)</div>
  )),
}));

vi.mock('@/utils/generateDocumentFromTemplate', () => ({
  generateDocumentFromTemplate: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/emailFolhaDanos', () => ({
  emailFolhaDanos: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

// ── Imports (após mocks) ──────────────────────────────────────────────────────

import { FecharContratoDialog } from './FecharContratoDialog';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  // Radix UI (Select, Dialog) precisa de ResizeObserver no jsdom.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  // Radix Dialog usa PointerEvent para fechar ao clicar fora.
  if (!globalThis.PointerEvent) {
    (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = class {
      constructor() {}
    };
  }
});

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  contratoId: 'contrato-1',
  contratoCodigo: 123,
  viaturaId: 'viatura-1',
  matricula: 'AB-12-CD',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FecharContratoDialog', () => {
  it('rent-a-car: pré-preenche "Recolhida", data e estação — fecho funciona sem editar defaults', async () => {
    // Aumenta timeout: o componente faz queries Supabase mockadas + Radix Dialog é pesado no jsdom.
    const onOpenChange = vi.fn();
    renderWithProviders(
      <FecharContratoDialog
        {...baseProps}
        onOpenChange={onOpenChange}
        motoristaId={null}
        estacaoOrigemId="est-1"
      />,
    );

    // Default tipoEvento = 'recolhido' (sem motorista → rent-a-car simples).
    // Radix RadioGroupItem renderiza <button role="radio"> — usar data-state
    // em vez de .checked (que só existe em HTMLInputElement).
    const radioRecolhida = screen.getByRole('radio', { name: /recolhida/i });
    await waitFor(() => {
      expect(radioRecolhida.getAttribute('data-state')).toBe('checked');
    });

    // Default data preenchida (formato datetime-local).
    const dataInput = screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(dataInput).toBeTruthy();

    // Default estação pré-preenchida com a estação de origem da viatura.
    // O Select mostra o nome da estação seleccionada. "Lisboa" aparece tanto
    // no trigger do Select como na <option> — usar getAllByText.
    await waitFor(() => {
      expect(screen.getAllByText('Lisboa').length).toBeGreaterThan(0);
    });

    // registarAgora = true por defeito → campos de recolha visíveis.
    // Preencher KM e combustível (obrigatórios quando registarAgora=true).
    const kmInput = screen.getByPlaceholderText('Ex: 45120');
    fireEvent.change(kmInput, { target: { value: '45120' } });

    // Clicar num nível de combustível.
    fireEvent.click(screen.getByText('3/4'));

    // Submeter — o botão diz "Fechar contrato" quando registarAgora=true.
    const submitBtn = screen.getByRole('button', { name: /fechar contrato/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    // Verificar que a mutation foi chamada com os defaults (sem edição manual).
    const callArgs = mockMutateAsync.mock.calls[0][0];
    expect(callArgs.tipoEvento).toBe('recolhido');
    expect(callArgs.estacaoId).toBe('est-1');
    expect(callArgs.contratoId).toBe('contrato-1');
    expect(callArgs.recolha).toBeDefined();
    expect(callArgs.recolha.km).toBe('45120');
    expect(callArgs.recolha.combustivel).toBe('3/4');
  }, 15000);

  it('TVDE: pré-preenche "Devolvida" e mostra campos de recolha física (KM, combustível, assinatura)', async () => {
    renderWithProviders(
      <FecharContratoDialog
        {...baseProps}
        motoristaId="mot-1"
        estacaoOrigemId="est-2"
      />,
    );

    // Default tipoEvento = 'devolvido' (com motorista → TVDE).
    const radioDevolvida = screen.getByRole('radio', { name: /devolvida/i });
    await waitFor(() => {
      expect(radioDevolvida.getAttribute('data-state')).toBe('checked');
    });

    // Campos de recolha física visíveis (registarAgora=true por defeito).
    expect(screen.getByPlaceholderText('Ex: 45120')).toBeTruthy();
    expect(screen.getByText('Combustível')).toBeTruthy();
    expect(screen.getByText('Vazio')).toBeTruthy();
    expect(screen.getByText('Cheio')).toBeTruthy();

    // Secção de assinaturas visível (mocked).
    expect(screen.getByTestId('assinaturas-mock')).toBeTruthy();

    // Botão de pré-visualizar folha de danos visível.
    expect(screen.getByRole('button', { name: /pré-visualizar folha/i })).toBeTruthy();

    // Header indica fecho (não agendamento).
    expect(screen.getByText(/fechar contrato #123/i)).toBeTruthy();
  });

  it('toggle "Registar a recolha agora" OFF → esconde campos de recolha e muda para "Agendar recolha"', async () => {
    renderWithProviders(
      <FecharContratoDialog
        {...baseProps}
        motoristaId="mot-1"
        estacaoOrigemId="est-1"
      />,
    );

    // registarAgora = true por defeito → campos de recolha visíveis.
    expect(screen.getByPlaceholderText('Ex: 45120')).toBeTruthy();
    expect(screen.getByText('Combustível')).toBeTruthy();
    expect(screen.getByTestId('assinaturas-mock')).toBeTruthy();

    // Toggle OFF: clicar no switch. O Switch não tem label associado via
    // <label htmlFor>, pelo que o nome acessível é vazio — usar role apenas.
    const switchBtn = screen.getByRole('switch');
    fireEvent.click(switchBtn);

    // Campos de recolha desaparecem.
    expect(screen.queryByPlaceholderText('Ex: 45120')).toBeNull();
    expect(screen.queryByText('Combustível')).toBeNull();
    expect(screen.queryByTestId('assinaturas-mock')).toBeNull();

    // Header muda para "Agendar recolha".
    expect(screen.getByText(/agendar recolha do contrato #123/i)).toBeTruthy();

    // Botão de submissão muda para "Agendar recolha".
    expect(screen.getByRole('button', { name: /agendar recolha/i })).toBeTruthy();

    // Submeter sem recolha — mutation chamada sem `recolha`.
    const submitBtn = screen.getByRole('button', { name: /agendar recolha/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    const callArgs = mockMutateAsync.mock.calls[0][0];
    expect(callArgs.recolha).toBeUndefined();
  });
});
