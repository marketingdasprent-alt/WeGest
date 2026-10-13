import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { opcoesData, opcoesDataOuNada, useEstadoPersistido } from './useEstadoPersistido';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('useEstadoPersistido', () => {
  it('sem nada guardado, começa no valor inicial', () => {
    const { result } = renderHook(() => useEstadoPersistido('t.pesquisa', ''));
    expect(result.current[0]).toBe('');
  });

  it('a pesquisa sobrevive a sair e voltar à página', () => {
    const primeira = renderHook(() => useEstadoPersistido('t.pesquisa', ''));
    act(() => primeira.result.current[1]('Dídimo'));
    primeira.unmount();

    const volta = renderHook(() => useEstadoPersistido('t.pesquisa', ''));
    expect(volta.result.current[0]).toBe('Dídimo');
  });

  it('pesquisa e filtros ficam na sessão; a ordenação fica para sempre', () => {
    const pesquisa = renderHook(() => useEstadoPersistido('t.pesquisa', ''));
    const ordem = renderHook(() =>
      useEstadoPersistido('t.ordem', 'codigo', { armazenamento: 'local' })
    );
    act(() => pesquisa.result.current[1]('abc'));
    act(() => ordem.result.current[1]('nome'));

    expect(sessionStorage.getItem('wegest:estado:t.pesquisa')).toBe('"abc"');
    expect(localStorage.getItem('wegest:estado:t.ordem')).toBe('"nome"');
    expect(localStorage.getItem('wegest:estado:t.pesquisa')).toBeNull();
  });

  it('um valor guardado de outro tipo é ignorado', () => {
    sessionStorage.setItem('wegest:estado:t.dir', '42');
    const { result } = renderHook(() => useEstadoPersistido('t.dir', 'asc'));
    expect(result.current[0]).toBe('asc');
  });

  it('texto guardado estragado é ignorado', () => {
    sessionStorage.setItem('wegest:estado:t.dir', '{nao e json');
    const { result } = renderHook(() => useEstadoPersistido('t.dir', 'asc'));
    expect(result.current[0]).toBe('asc');
  });

  it('um filtro novo acrescentado ao objecto não fica undefined', () => {
    sessionStorage.setItem('wegest:estado:t.filtros', JSON.stringify({ estado: 'em_curso' }));
    const { result } = renderHook(() =>
      useEstadoPersistido('t.filtros', { estado: 'todos', estacao: 'todas' })
    );
    expect(result.current[0]).toEqual({ estado: 'em_curso', estacao: 'todas' });
  });

  it('a semana escolhida volta como data', () => {
    const semana = new Date('2026-09-28T00:00:00Z');
    const primeira = renderHook(() =>
      useEstadoPersistido('t.semana', new Date('2026-10-05T00:00:00Z'), opcoesData)
    );
    act(() => primeira.result.current[1](semana));
    primeira.unmount();

    const volta = renderHook(() =>
      useEstadoPersistido('t.semana', new Date('2026-10-05T00:00:00Z'), opcoesData)
    );
    expect(volta.result.current[0]).toBeInstanceOf(Date);
    expect(volta.result.current[0].getTime()).toBe(semana.getTime());
  });

  it('uma data vazia guardada volta vazia', () => {
    const primeira = renderHook(() =>
      useEstadoPersistido<Date | null>('t.dia', new Date(), opcoesDataOuNada)
    );
    act(() => primeira.result.current[1](null));
    primeira.unmount();

    const volta = renderHook(() =>
      useEstadoPersistido<Date | null>('t.dia', new Date(), opcoesDataOuNada)
    );
    expect(volta.result.current[0]).toBeNull();
  });
});
