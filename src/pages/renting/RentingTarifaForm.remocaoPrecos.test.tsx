import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import RentingTarifaForm from './RentingTarifaForm';

// ─────────────────────────────────────────────────────────────────────────────
// Gravar uma tarifa sem o preço de um modelo com contrato aberto: a RPC recusa
// com o HINT `confirmar_remocao_precos` (20260925100000). O formulário tem de
// mostrar a lista que vem da BD e só repetir a gravação — agora confirmada —
// se o utilizador disser que sim. Antes disto o preço saía calado (contrato
// #16 da Premium Ride, 2026-09-21).
// ─────────────────────────────────────────────────────────────────────────────

const MENSAGEM =
  'Preço em uso em contratos abertos: Astra — contrato #16 (BT-21-UN). Se gravares, esses contratos ficam sem preço.';

const { rpc, toast } = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => {
  const TARIFA = { id: 'tarifa-1', nome: 'TVDE', tipo: 'tvde', ativa: true };
  const PRECOS = [{ modelo_id: 'modelo-1', preco_semana: 275 }];
  const porTabela: Record<string, unknown> = {
    renting_tarifas: TARIFA,
    renting_tarifa_precos_modelo: PRECOS,
  };
  const chainable = (resultado: Record<string, unknown>) => {
    const p = Promise.resolve(resultado);
    for (const m of ['select', 'eq', 'order', 'single', 'update', 'insert']) {
      (p as unknown as Record<string, unknown>)[m] = () => p;
    }
    return p;
  };
  return {
    supabase: {
      from: (tabela: string) => chainable({ data: porTabela[tabela] ?? [], error: null }),
      rpc,
    },
  };
});

vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ orgId: 'org-1' }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canEdit: () => true }) }));
vi.mock('@/hooks/useModelosElegiveisTvde', () => ({
  useModelosElegiveisTvde: () => ({ data: new Set(['modelo-1']) }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

function renderForm() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/renting/tarifas/tarifa-1']}>
        <Routes>
          <Route path="/renting/tarifas/:id" element={<RentingTarifaForm />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function gravar() {
  renderForm();
  const botao = await screen.findByRole('button', { name: /^Guardar$/ });
  // Espera o formulário hidratar (nome da tarifa carregado) antes de gravar.
  await screen.findByDisplayValue('TVDE');
  fireEvent.click(botao);
}

describe('RentingTarifaForm — tirar preços em uso', () => {
  beforeEach(() => {
    rpc.mockReset();
    toast.mockReset();
  });

  it('a recusa da BD abre a confirmação com os contratos, em vez de um erro', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: MENSAGEM, details: null, hint: 'confirmar_remocao_precos' },
    });

    await gravar();

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(MENSAGEM)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith(
      'salvar_precos_modelo_tarifa',
      expect.objectContaining({ p_tarifa_id: 'tarifa-1', p_confirmar_remocao: false })
    );
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('confirmar repete a gravação com p_confirmar_remocao = true', async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: 'P0001',
          message: MENSAGEM,
          details: null,
          hint: 'confirmar_remocao_precos',
        },
      })
      .mockResolvedValueOnce({ data: null, error: null });

    await gravar();
    fireEvent.click(await screen.findByRole('button', { name: 'Gravar mesmo assim' }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc).toHaveBeenLastCalledWith(
      'salvar_precos_modelo_tarifa',
      expect.objectContaining({ p_tarifa_id: 'tarifa-1', p_confirmar_remocao: true })
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tarifa actualizada' }))
    );
  });

  it('cancelar não grava de novo', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: MENSAGEM, details: null, hint: 'confirmar_remocao_precos' },
    });

    await gravar();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
