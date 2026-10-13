import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  parametrosARestaurar,
  soEstes,
  useFiltrosDaUrlPersistidos,
} from './useFiltrosDaUrlPersistidos';

const PARAMS = { filtros: ['search', 'status'], ordenacao: ['sort', 'dir'] } as const;

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('parametrosARestaurar', () => {
  it('endereço limpo recebe filtros da sessão e ordenação guardada', () => {
    const r = parametrosARestaurar(
      new URLSearchParams(),
      'search=ana&status=ativo',
      'sort=nome&dir=asc',
      PARAMS
    );
    expect(r?.toString()).toBe('search=ana&status=ativo&sort=nome&dir=asc');
  });

  it('uma ligação com pesquisa não ganha filtros antigos, mas ganha a ordenação', () => {
    const r = parametrosARestaurar(
      new URLSearchParams('search=joao'),
      'status=inativo',
      'sort=nome&dir=desc',
      PARAMS
    );
    expect(r?.get('status')).toBeNull();
    expect(r?.get('search')).toBe('joao');
    expect(r?.get('sort')).toBe('nome');
  });

  it('sem nada guardado não mexe no endereço', () => {
    expect(parametrosARestaurar(new URLSearchParams(), null, null, PARAMS)).toBeNull();
  });
});

describe('soEstes', () => {
  it('guarda só os parâmetros listados', () => {
    expect(soEstes(new URLSearchParams('search=a&motorista=123'), ['search'])).toBe('search=a');
  });
});

function wrapper(url: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
}

describe('useFiltrosDaUrlPersistidos', () => {
  it('entrar pelo menu, com o endereço limpo, repõe o que estava', () => {
    const primeira = renderHook(
      () => {
        useFiltrosDaUrlPersistidos('t.motoristas', PARAMS);
        return useSearchParams();
      },
      { wrapper: wrapper('/motoristas?search=ana&sort=nome&dir=desc') }
    );
    primeira.unmount();

    const volta = renderHook(
      () => {
        useFiltrosDaUrlPersistidos('t.motoristas', PARAMS);
        return useSearchParams()[0].toString();
      },
      { wrapper: wrapper('/motoristas') }
    );
    expect(volta.result.current).toBe('search=ana&sort=nome&dir=desc');
  });

  it('limpar os filtros também fica guardado', () => {
    const primeira = renderHook(
      () => {
        useFiltrosDaUrlPersistidos('t.motoristas', PARAMS);
        return useSearchParams();
      },
      { wrapper: wrapper('/motoristas?search=ana') }
    );
    act(() => primeira.result.current[1](new URLSearchParams(), { replace: true }));
    primeira.unmount();

    const volta = renderHook(
      () => {
        useFiltrosDaUrlPersistidos('t.motoristas', PARAMS);
        return useSearchParams()[0].toString();
      },
      { wrapper: wrapper('/motoristas') }
    );
    expect(volta.result.current).toBe('');
  });
});
