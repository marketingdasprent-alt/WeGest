import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

import { supabase } from '@/integrations/supabase/client';
import { FolhaDanosPendenteAlert } from './FolhaDanosPendenteAlert';
import type { ContratoRenting } from '@/types/contratoRenting';

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

type SupabaseResult = { data: unknown; error: unknown };

function chainable(result: SupabaseResult) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  c.select = vi.fn().mockReturnValue(c);
  c.update = vi.fn().mockReturnValue(c);
  c.eq = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  (c as unknown as { then: unknown }).then = (
    resolve: (v: SupabaseResult) => void,
    reject?: (r: unknown) => void
  ) => Promise.resolve(result).then(resolve, reject);
  return c;
}

function setupViaturaCombustao() {
  const chains: Record<string, ReturnType<typeof chainable>> = {};
  const tableResults: Record<string, SupabaseResult> = {
    viaturas: { data: { combustivel: 'Diesel', combustivel_id: null }, error: null },
    contratos_renting: { data: null, error: null },
  };
  (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from = vi
    .fn()
    .mockImplementation((table: string) => {
      if (!chains[table])
        chains[table] = chainable(tableResults[table] ?? { data: null, error: null });
      return chains[table];
    });
  (supabase.auth as unknown as { getUser: ReturnType<typeof vi.fn> }).getUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: 'user-1' } } });
  return chains;
}

function renderComponent(contrato: Partial<ContratoRenting>) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return render(<FolhaDanosPendenteAlert contrato={contrato as ContratoRenting} />, {
    wrapper: Wrapper,
  });
}

const BASE_CONTRATO: Partial<ContratoRenting> = {
  id: 'c1',
  viatura_id: 'vit-1',
  estado_operacional: 'em_curso',
  entrega_via_any_rent: false,
  km_saida: null,
  combustivel_saida: null,
  eletricidade_saida: null,
};

describe('FolhaDanosPendenteAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra o banner num contrato em curso com a folha de danos por preencher', async () => {
    setupViaturaCombustao();
    renderComponent(BASE_CONTRATO);
    expect(await screen.findByText(/folha de danos/i)).toBeTruthy();
  });

  it('não mostra nada quando os dados de saída já estão preenchidos', async () => {
    setupViaturaCombustao();
    const { container } = renderComponent({
      ...BASE_CONTRATO,
      km_saida: 45120,
      combustivel_saida: 'Cheio',
    });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('não mostra nada num contrato entregue via Any Rent', async () => {
    setupViaturaCombustao();
    const { container } = renderComponent({ ...BASE_CONTRATO, entrega_via_any_rent: true });
    await waitFor(() => expect(supabase.from).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('não mostra nada num contrato ainda agendado', async () => {
    setupViaturaCombustao();
    const { container } = renderComponent({ ...BASE_CONTRATO, estado_operacional: 'agendado' });
    await waitFor(() => expect(supabase.from).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('grava km e combustível de saída ao preencher', async () => {
    const chains = setupViaturaCombustao();
    renderComponent(BASE_CONTRATO);

    fireEvent.click(await screen.findByText(/Preencher dados/i));

    const guardarBtn = await screen.findByRole('button', { name: /Guardar/i });
    expect(guardarBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/KM de saída/i), { target: { value: '45120' } });
    fireEvent.click(screen.getByText('Cheio'));
    expect(guardarBtn).not.toBeDisabled();

    fireEvent.click(guardarBtn);

    await waitFor(() =>
      expect(chains.contratos_renting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          km_saida: 45120,
          combustivel_saida: 'Cheio',
          eletricidade_saida: null,
        })
      )
    );
  });
});
