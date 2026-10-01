import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ViaturasFiltrosBarra } from './ViaturasFiltrosBarra';
import type { FiltrosViaturas, OpcaoFiltro } from '@/utils/filtrosViaturas';

const FILTROS: FiltrosViaturas = {
  search: '',
  status: 'all',
  categoria: 'all',
  combustivel: 'all',
  tipo: 'all',
};
const OPCOES: Record<'status' | 'categoria' | 'combustivel', OpcaoFiltro[]> = {
  status: [
    { value: 'all', label: 'Todos', count: 10 },
    { value: 'disponivel', label: 'Disponível', count: 3 },
  ],
  combustivel: [
    { value: 'all', label: 'Todos', count: 10 },
    { value: 'eletrico', label: 'Elétrico', count: 6 },
  ],
  categoria: [
    { value: 'all', label: 'Todas', count: 10 },
    { value: 'sem_info', label: 'Sem informação', count: 10 },
  ],
};

const montar = (mudar: Partial<Parameters<typeof ViaturasFiltrosBarra>[0]> = {}) => {
  const props = {
    filtros: FILTROS,
    opcoes: OPCOES,
    onSearch: vi.fn(),
    onFiltro: vi.fn(),
    aMostrar: 10,
    total: 12,
    temFiltros: false,
    onLimpar: vi.fn(),
    ...mudar,
  };
  render(<ViaturasFiltrosBarra {...props} />);
  return props;
};

describe('ViaturasFiltrosBarra', () => {
  it('diz quantas viaturas estão à vista e sem filtros não mostra "Limpar"', () => {
    montar();
    expect(screen.getByText(/de 12/).textContent).toContain('10 de 12 viaturas');
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
  });

  it('Categoria só aparece se alguma viatura a tiver preenchida', () => {
    montar();
    expect(screen.queryByText('Categoria:')).toBeNull();
    expect(screen.getByText('Combustível:')).not.toBeNull();
  });

  it('filtro activo tem ✕ que o limpa', () => {
    const props = montar({ filtros: { ...FILTROS, combustivel: 'eletrico' }, temFiltros: true });
    expect(screen.getByText('Elétrico')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtro Combustível' }));
    expect(props.onFiltro).toHaveBeenCalledWith('combustivel', 'all');
  });

  it('a pesquisa tem ✕ para apagar, e "Limpar filtros" limpa tudo', () => {
    const props = montar({ filtros: { ...FILTROS, search: 'kia' }, temFiltros: true });
    fireEvent.click(screen.getByRole('button', { name: 'Limpar pesquisa' }));
    expect(props.onSearch).toHaveBeenCalledWith('');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(props.onLimpar).toHaveBeenCalledOnce();
  });

  it('"/" em qualquer ponto da página põe o cursor na pesquisa', () => {
    montar();
    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(
      screen.getByRole('searchbox', { name: 'Pesquisar viaturas' })
    );
  });

  it('Esc na pesquisa apaga o que se escreveu', () => {
    const props = montar({ filtros: { ...FILTROS, search: 'kia' }, temFiltros: true });
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(props.onSearch).toHaveBeenCalledWith('');
  });
});
