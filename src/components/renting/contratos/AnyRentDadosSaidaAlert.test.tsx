import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

import { supabase } from '@/integrations/supabase/client';
import { AnyRentDadosSaidaAlert } from './AnyRentDadosSaidaAlert';
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

function setupSupabase(tableResults: Record<string, SupabaseResult>) {
  const chains: Record<string, ReturnType<typeof chainable>> = {};
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

// Viatura a combustão (sem combustivel_id) — mostraCombustivel=true,
// mostraEletrico=false. Mantém os testes determinísticos e simples.
function setupViaturaCombustao() {
  return setupSupabase({
    viaturas: { data: { combustivel: 'Diesel', combustivel_id: null }, error: null },
    contratos_renting: { data: null, error: null },
  });
}

function renderComponent(contrato: Partial<ContratoRenting>) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return render(<AnyRentDadosSaidaAlert contrato={contrato as ContratoRenting} />, {
    wrapper: Wrapper,
  });
}

const BASE_CONTRATO: Partial<ContratoRenting> = {
  id: 'c1',
  viatura_id: 'vit-1',
  km_saida: null,
  combustivel_saida: null,
  eletricidade_saida: null,
  entrega_via_any_rent: false,
};

describe('AnyRentDadosSaidaAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não mostra nada quando entrega_via_any_rent é false', async () => {
    setupViaturaCombustao();
    const { container } = renderComponent({ ...BASE_CONTRATO, entrega_via_any_rent: false });
    // Dá tempo à query de tipo de combustível resolver, para confirmar que
    // mesmo depois disso o banner continua ausente.
    await waitFor(() => expect(supabase.from).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('não mostra nada quando entrega_via_any_rent é true mas os dados já estão completos', async () => {
    setupViaturaCombustao();
    const { container } = renderComponent({
      ...BASE_CONTRATO,
      entrega_via_any_rent: true,
      km_saida: 1000,
      combustivel_saida: 'Cheio',
    });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('mostra o banner quando entrega_via_any_rent é true e faltam dados', async () => {
    setupViaturaCombustao();
    renderComponent({ ...BASE_CONTRATO, entrega_via_any_rent: true });
    expect(await screen.findByText(/Preencher dados/i)).toBeTruthy();
  });

  it('desativa Guardar até KM e combustível estarem preenchidos, e grava ao guardar', async () => {
    const chains = setupViaturaCombustao();
    renderComponent({ ...BASE_CONTRATO, entrega_via_any_rent: true });

    fireEvent.click(await screen.findByText(/Preencher dados/i));

    const guardarBtn = await screen.findByRole('button', { name: /Guardar/i });
    expect(guardarBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/KM de saída/i), { target: { value: '45120' } });
    expect(guardarBtn).toBeDisabled();

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
