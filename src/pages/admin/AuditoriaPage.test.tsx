import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

// ── Mocks ────────────────────────────────────────────────────

const mockUseAuditHistory = vi.fn();
vi.mock('@/hooks/useAuditHistory', () => ({
  useAuditHistory: (...args: unknown[]) => mockUseAuditHistory(...args),
}));

// Select do Radix usa Popper — mockar para evitar problemas de portal no jsdom
vi.mock('@/components/ui/select', () => {
  const React = require('react');
  return {
    Select: ({ value, onValueChange, children }: any) => (
      <div data-testid="select-root" data-value={value}>
        {React.Children.map(children, (child: ReactNode) =>
          React.cloneElement(child, { _value: value, _onValueChange: onValueChange })
        )}
      </div>
    ),
    SelectTrigger: ({ children, ...props }: any) => (
      <button type="button" role="combobox" {...props}>
        {children}
      </button>
    ),
    SelectValue: ({ _value }: any) => <span>{_value}</span>,
    SelectContent: ({ children, _onValueChange }: any) => (
      <div role="listbox">
        {React.Children.map(children, (child: ReactNode) =>
          React.cloneElement(child, { _onValueChange })
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

import AuditoriaPage from './AuditoriaPage';
import type { AuditEntry } from '@/types/audit';

// ── Helpers ──────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <AuditoriaPage />
    </MemoryRouter>
  );
}

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'entry-1',
    entidade: 'contrato',
    tabelaOrigem: 'contratos_edicoes',
    acao: 'edicao',
    actorId: 'user-1',
    detalhe: 'Alteração de valor',
    payload: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

// ── Dados de exemplo ─────────────────────────────────────────

const SAMPLE_ENTRIES: AuditEntry[] = [
  makeEntry({ id: '1', acao: 'edicao', detalhe: 'Alteração de valor' }),
  makeEntry({ id: '2', acao: 'reimpressao', detalhe: 'Reimpressão do contrato' }),
  makeEntry({ id: '3', acao: 'alteracao', detalhe: 'Mudança de estado' }),
];

// ── Tests ─────────────────────────────────────────────────────

describe('AuditoriaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuditHistory.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
  });

  it('renderiza título e descrição', () => {
    renderPage();
    expect(screen.getByText('Auditoria')).toBeTruthy();
    expect(screen.getByText('Histórico de alterações por entidade')).toBeTruthy();
  });

  it('mostra estado inicial antes de submeter', () => {
    renderPage();
    expect(
      screen.getByText(/Seleccione uma entidade e introduza o ID/i)
    ).toBeTruthy();
  });

  it('desabilita botão Auditar quando ID está vazio', () => {
    renderPage();
    const btn = screen.getByRole('button', { name: /Auditar/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('habilita botão Auditar quando ID é preenchido', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/ID do registo/i), {
      target: { value: 'test-uuid' },
    });
    expect(
      (screen.getByRole('button', { name: /Auditar/i }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('chama useAuditHistory com entidade e id após submeter', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/ID do registo/i), {
      target: { value: 'contrato-uuid-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Auditar/i }));

    expect(mockUseAuditHistory).toHaveBeenCalledWith({
      entidade: 'contrato',
      id: 'contrato-uuid-123',
    });
  });

  it('renderiza entradas da auditoria na timeline', async () => {
    mockUseAuditHistory.mockReturnValue({
      data: SAMPLE_ENTRIES,
      isLoading: false,
      error: null,
    });

    renderPage();
    fireEvent.change(screen.getByLabelText(/ID do registo/i), {
      target: { value: 'test-id' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Auditar/i }));

    await waitFor(() => {
      expect(screen.getByText('edicao')).toBeTruthy();
      expect(screen.getByText('reimpressao')).toBeTruthy();
      expect(screen.getByText('alteracao')).toBeTruthy();
    });
  });

  it('filtra entradas por busca textual', async () => {
    mockUseAuditHistory.mockReturnValue({
      data: SAMPLE_ENTRIES,
      isLoading: false,
      error: null,
    });

    renderPage();
    fireEvent.change(screen.getByLabelText(/ID do registo/i), {
      target: { value: 'test-id' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Auditar/i }));

    await waitFor(() => {
      expect(screen.getByText('edicao')).toBeTruthy();
    });

    // Filtrar por "reimpressao"
    fireEvent.change(screen.getByLabelText(/Buscar na auditoria/i), {
      target: { value: 'reimpressao' },
    });

    expect(screen.getByText('reimpressao')).toBeTruthy();
    expect(screen.queryByText('edicao')).toBeNull();
    expect(screen.queryByText('alteracao')).toBeNull();
  });

  it('mostra paginação quando há mais de 10 entradas', async () => {
    const manyEntries: AuditEntry[] = Array.from({ length: 15 }, (_, i) =>
      makeEntry({
        id: `entry-${i}`,
        acao: `acao-${i}`,
        detalhe: `detalhe-${i}`,
      })
    );

    mockUseAuditHistory.mockReturnValue({
      data: manyEntries,
      isLoading: false,
      error: null,
    });

    renderPage();
    fireEvent.change(screen.getByLabelText(/ID do registo/i), {
      target: { value: 'test-id' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Auditar/i }));

    await waitFor(() => {
      expect(screen.getByText('acao-0')).toBeTruthy();
    });

    // Paginação visível
    expect(screen.getByLabelText(/Página anterior/i)).toBeTruthy();
    expect(screen.getByLabelText(/Página seguinte/i)).toBeTruthy();
    expect(screen.getByText(/1 \/ 2/i)).toBeTruthy();

    // Primeira página: 10 entradas
    expect(screen.getByText(/1–10 de 15/i)).toBeTruthy();

    // Botão anterior desabilitado na página 1
    expect(
      (screen.getByLabelText(/Página anterior/i) as HTMLButtonElement).disabled
    ).toBe(true);

    // Ir para página 2
    fireEvent.click(screen.getByLabelText(/Página seguinte/i));

    await waitFor(() => {
      expect(screen.getByText('acao-10')).toBeTruthy();
    });
    expect(screen.getByText(/11–15 de 15/i)).toBeTruthy();
    expect(
      (screen.getByLabelText(/Página seguinte/i) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('mostra estado de loading', async () => {
    mockUseAuditHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    renderPage();
    fireEvent.change(screen.getByLabelText(/ID do registo/i), {
      target: { value: 'test-id' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Auditar/i }));

    await waitFor(() => {
      expect(screen.getByRole('status', { name: /A carregar auditoria/i })).toBeTruthy();
    });
  });

  it('mostra estado de erro', async () => {
    mockUseAuditHistory.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Falha ao carregar histórico'),
    });

    renderPage();
    fireEvent.change(screen.getByLabelText(/ID do registo/i), {
      target: { value: 'test-id' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Auditar/i }));

    await waitFor(() => {
      expect(screen.getByText(/Falha ao carregar histórico/i)).toBeTruthy();
    });
  });

  it('mostra aviso para entidade sem histórico (reserva)', () => {
    mockUseAuditHistory.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });

    renderPage();

    // Selecionar "reserva" — usar o Select mockado
    const reservaOption = screen.getByRole('option', { name: 'Reserva' });
    fireEvent.click(reservaOption);

    expect(
      screen.getByText(/não tem tabelas de histórico dedicadas/i)
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /Auditar/i }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('mostra estado vazio quando não há entradas', async () => {
    mockUseAuditHistory.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    renderPage();
    fireEvent.change(screen.getByLabelText(/ID do registo/i), {
      target: { value: 'test-id' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Auditar/i }));

    await waitFor(() => {
      expect(screen.getByText(/Sem registos de auditoria/i)).toBeTruthy();
    });
  });
});
