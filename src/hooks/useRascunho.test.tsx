import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useRascunho } from './useRascunho';
import { criarStoreMemoria } from '@/utils/rascunhoStore';

// O que isto protege: alguém a meio de uma folha de danos, com fotos tiradas e
// descrições escritas, dá refresh sem querer. Antes disto perdia tudo.

describe('useRascunho', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('restaura o que estava guardado, sem esperar por interacção nenhuma', async () => {
    const store = criarStoreMemoria();
    await store.guardar('dano-v1', { descricao: 'Risco no para-choques' });
    const restaurar = vi.fn();

    renderHook(() => useRascunho({ chave: 'dano-v1', valor: { descricao: '' }, restaurar, store }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(restaurar).toHaveBeenCalledWith({ descricao: 'Risco no para-choques' });
  });

  it('não chama restaurar quando não há rascunho — o formulário fica como está', async () => {
    const restaurar = vi.fn();
    renderHook(() =>
      useRascunho({
        chave: 'vazio',
        valor: { descricao: '' },
        restaurar,
        store: criarStoreMemoria(),
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(restaurar).not.toHaveBeenCalled();
  });

  it('guarda depois do debounce, não a cada tecla', async () => {
    const store = criarStoreMemoria();
    const { rerender } = renderHook(
      ({ valor }) => useRascunho({ chave: 'k', valor, restaurar: vi.fn(), store, debounceMs: 300 }),
      { initialProps: { valor: { km: '' } } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    rerender({ valor: { km: '1' } });
    rerender({ valor: { km: '12' } });
    rerender({ valor: { km: '123' } });

    // Antes do debounce ainda não escreveu nada.
    expect(await store.ler('k')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(await store.ler('k')).toEqual({ km: '123' });
  });

  it('limpar apaga e não volta a guardar — senão o reset pós-submissão gravava o formulário vazio', async () => {
    const store = criarStoreMemoria();
    const { result, rerender } = renderHook(
      ({ valor }) =>
        useRascunho({ chave: 'k2', valor, restaurar: vi.fn(), store, debounceMs: 100 }),
      { initialProps: { valor: { km: '500' } } }
    );

    // Primeiro deixar a leitura terminar (é ela que arranca a gravação), só
    // depois avançar o debounce.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(await store.ler('k2')).toEqual({ km: '500' });

    await act(async () => {
      await result.current.limpar();
    });
    expect(await store.ler('k2')).toBeNull();

    // O formulário limpa-se a seguir à submissão: isto não pode ressuscitar nada.
    rerender({ valor: { km: '' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(await store.ler('k2')).toBeNull();
  });

  it('chave null desliga tudo — serve para não guardar com o diálogo fechado', async () => {
    const store = criarStoreMemoria();
    const restaurar = vi.fn();
    const { rerender } = renderHook(
      ({ valor }) => useRascunho({ chave: null, valor, restaurar, store, debounceMs: 50 }),
      { initialProps: { valor: { km: '9' } } }
    );

    rerender({ valor: { km: '99' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(restaurar).not.toHaveBeenCalled();
    expect(await store.ler('null')).toBeNull();
  });
});
