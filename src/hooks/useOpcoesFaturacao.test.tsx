import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { OpcaoFornecedor } from '@/types/faturacao';

const buscar = vi.fn();
vi.mock('@/lib/faturacao', () => ({ buscarOpcoesFaturacao: (...a: unknown[]) => buscar(...a) }));
import { useEscolhaFornecedor, usePedirFornecedor } from './useOpcoesFaturacao';

const ki = (o: Partial<OpcaoFornecedor> = {}): OpcaoFornecedor => ({
  integracao_id: 'ki',
  provider: 'keyinvoice',
  label: 'KeyInvoice',
  disponivel: true,
  ultima_usada: false,
  ...o,
});
const pv = (o: Partial<OpcaoFornecedor> = {}): OpcaoFornecedor => ({
  integracao_id: 'pv',
  provider: 'primavera',
  label: 'Primavera',
  disponivel: true,
  ultima_usada: false,
  ...o,
});

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  buscar.mockReset();
});

describe('useEscolhaFornecedor', () => {
  it('pré-seleciona a última usada', async () => {
    buscar.mockResolvedValue([ki(), pv({ ultima_usada: true })]);
    const { result } = renderHook(() => useEscolhaFornecedor('FT', { contrato_id: 'c1' }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.integracaoId).toBe('pv'));
    expect(result.current.providerLabel).toBe('Primavera');
    expect(result.current.bloqueiaConfirmar).toBe(false);
  });

  it('duas disponíveis sem histórico: bloqueia até escolher', async () => {
    buscar.mockResolvedValue([ki(), pv()]);
    const { result } = renderHook(() => useEscolhaFornecedor('FT', { contrato_id: 'c1' }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bloqueiaConfirmar).toBe(true);
    act(() => result.current.setIntegracaoId('ki'));
    expect(result.current.integracaoId).toBe('ki');
    expect(result.current.bloqueiaConfirmar).toBe(false);
  });

  it('a escolha deixa de valer se o tipo a tornar indisponível', async () => {
    buscar.mockImplementation(async (tipo: string) =>
      tipo === 'FR'
        ? [ki(), pv({ disponivel: false, motivo: 'O Primavera ainda não emite Faturas-Recibo' })]
        : [ki(), pv()]
    );
    const { result, rerender } = renderHook(
      ({ tipo }) => useEscolhaFornecedor(tipo, { contrato_id: 'c1' }),
      {
        wrapper: wrapper(),
        initialProps: { tipo: 'FT' as 'FT' | 'FR' },
      }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setIntegracaoId('pv'));
    rerender({ tipo: 'FR' });
    await waitFor(() => expect(result.current.integracaoId).toBe('ki'));
  });

  it('nenhuma disponível: não bloqueia (a fase interna continua a funcionar)', async () => {
    buscar.mockResolvedValue([
      ki({ integracao_id: null, disponivel: false }),
      pv({ integracao_id: null, disponivel: false }),
    ]);
    const { result } = renderHook(() => useEscolhaFornecedor('FT', { contrato_id: 'c1' }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.integracaoId).toBeNull();
    expect(result.current.providerLabel).toBeNull();
    expect(result.current.bloqueiaConfirmar).toBe(false);
  });

  it('erro a carregar: não bloqueia (o servidor decide)', async () => {
    buscar.mockRejectedValue(new Error('rede'));
    const { result } = renderHook(() => useEscolhaFornecedor('FT', { contrato_id: 'c1' }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.error?.message).toBe('rede'));
    expect(result.current.bloqueiaConfirmar).toBe(false);
  });

  it('sem contexto não pede nada', () => {
    renderHook(() => useEscolhaFornecedor('FT', {}), { wrapper: wrapper() });
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe('usePedirFornecedor', () => {
  it('resolve sozinho quando só há uma opção disponível', async () => {
    buscar.mockResolvedValue([
      ki({ ultima_usada: false }),
      pv({
        disponivel: false,
        ultima_usada: true,
        motivo: 'O Primavera ainda não emite Faturas-Recibo',
      }),
    ]);
    const { result } = renderHook(() => usePedirFornecedor(), { wrapper: wrapper() });
    await expect(result.current.pedir('FR', { cobranca_id: 'x' })).resolves.toEqual({
      integracaoId: 'ki',
    });
  });

  it('sem fornecedor disponível devolve null (a emissão segue e o servidor explica)', async () => {
    buscar.mockResolvedValue([
      ki({ integracao_id: null, disponivel: false }),
      pv({ integracao_id: null, disponivel: false }),
    ]);
    const { result } = renderHook(() => usePedirFornecedor(), { wrapper: wrapper() });
    await expect(result.current.pedir('FT', { cobranca_id: 'x' })).resolves.toEqual({
      integracaoId: null,
    });
  });
});

describe('usePedirFornecedor com diálogo', () => {
  type Resultado = { integracaoId: string | null } | 'cancelado';
  const pedidos: Promise<Resultado>[] = [];

  function Harness() {
    const { pedir, dialogo } = usePedirFornecedor();
    return (
      <>
        <button onClick={() => pedidos.push(pedir('FT', { cobranca_id: 'x' }))}>pedir</button>
        {dialogo}
      </>
    );
  }
  const montar = (opcoes: OpcaoFornecedor[] = [ki(), pv()]) => {
    pedidos.length = 0;
    buscar.mockResolvedValue(opcoes);
    const Wrapper = wrapper();
    render(
      <Wrapper>
        <Harness />
      </Wrapper>
    );
  };
  const abrir = async () => {
    fireEvent.click(screen.getByText('pedir'));
    await screen.findByText(/por onde emitir/i);
  };

  it('abre o diálogo e resolve com a escolha', async () => {
    montar();
    await abrir();
    fireEvent.click(screen.getByRole('radio', { name: /primavera/i }));
    fireEvent.click(screen.getByRole('button', { name: /emitir/i }));
    await expect(pedidos[0]).resolves.toEqual({ integracaoId: 'pv' });
  });

  it('com duas disponíveis e última usada abre na mesma o diálogo, já com ela marcada', async () => {
    montar([ki(), pv({ ultima_usada: true })]);
    await abrir();
    expect(screen.getByRole('radio', { name: /primavera/i })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /keyinvoice/i }));
    fireEvent.click(screen.getByRole('button', { name: /emitir/i }));
    await expect(pedidos[0]).resolves.toEqual({ integracaoId: 'ki' });
  });

  it('Cancelar resolve cancelado', async () => {
    montar();
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    await expect(pedidos[0]).resolves.toBe('cancelado');
  });

  it('um segundo pedido cancela o primeiro e continua a funcionar', async () => {
    montar();
    await abrir();
    fireEvent.click(screen.getByText('pedir'));
    await expect(pedidos[0]).resolves.toBe('cancelado');
    fireEvent.click(await screen.findByRole('radio', { name: /keyinvoice/i }));
    fireEvent.click(screen.getByRole('button', { name: /emitir/i }));
    await expect(pedidos[1]).resolves.toEqual({ integracaoId: 'ki' });
  });
});
