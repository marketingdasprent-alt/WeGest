import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAmbitoViaturas } from './useAmbitoViaturas';
import { AmbitoFrotaAviso } from '@/components/viaturas/AmbitoFrotaAviso';

const permissoes = { isAdmin: false, cargo: 'Gestor TVDE' as string | null, loading: false };
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => permissoes }));

beforeEach(() => {
  permissoes.isAdmin = false;
  permissoes.cargo = 'Gestor TVDE';
  permissoes.loading = false;
});

const comRouter =
  (url = '/viaturas') =>
  ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );

describe('useAmbitoViaturas', () => {
  it('Gestor TVDE: filtro activo por omissão', () => {
    const { result } = renderHook(() => useAmbitoViaturas(), { wrapper: comRouter() });
    expect(result.current.ambito?.nome).toBe('TVDE');
    expect(result.current.activo).toBe(true);
  });

  it('com ?frota=toda no URL, mostra a frota toda', () => {
    const { result } = renderHook(() => useAmbitoViaturas(), {
      wrapper: comRouter('/viaturas?frota=toda'),
    });
    expect(result.current.verTudo).toBe(true);
    expect(result.current.activo).toBe(false);
  });

  it('enquanto as permissões carregam, não filtra (evita piscar)', () => {
    permissoes.loading = true;
    const { result } = renderHook(() => useAmbitoViaturas(), { wrapper: comRouter() });
    expect(result.current.activo).toBe(false);
  });

  it('cargo sem âmbito: nunca filtra', () => {
    permissoes.cargo = 'Faturação';
    const { result } = renderHook(() => useAmbitoViaturas(), { wrapper: comRouter() });
    expect(result.current.ambito).toBeNull();
    expect(result.current.activo).toBe(false);
  });
});

function Pagina() {
  const ambito = useAmbitoViaturas();
  const { search } = useLocation();
  return (
    <>
      <AmbitoFrotaAviso ambito={ambito} oQue="viaturas" />
      <output data-testid="url">{search}</output>
    </>
  );
}

describe('AmbitoFrotaAviso', () => {
  it('diz o que está filtrado e "Ver toda a frota" põe-no no URL; "Só TVDE" volta atrás', () => {
    render(<Pagina />, { wrapper: comRouter() });
    expect(screen.getByText(/só viaturas/i)).toHaveTextContent('TVDE');

    act(() => fireEvent.click(screen.getByRole('button', { name: /ver toda a frota/i })));
    expect(screen.getByTestId('url')).toHaveTextContent('frota=toda');
    expect(screen.getByText(/toda a frota/i, { selector: 'strong' })).toBeInTheDocument();

    act(() => fireEvent.click(screen.getByRole('button', { name: /só tvde/i })));
    expect(screen.getByTestId('url')).toBeEmptyDOMElement();
  });

  it('sem âmbito não aparece', () => {
    permissoes.cargo = 'Faturação';
    const { container } = render(
      <AmbitoFrotaAviso
        ambito={{ ambito: null, activo: false, verTudo: false, setVerTudo: vi.fn() }}
        oQue="viaturas"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
