import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CidadeAssinaturaField } from './CidadeAssinaturaField';

// As estações reais têm `cidade` por preencher — é precisamente esse o caso
// que partia o campo, por isso é esse que se testa.
const ESTACOES = [
  { id: 'e1', nome: 'Leiria', cidade: null, morada: null, ativa: true },
  { id: 'e2', nome: 'Prior Velho', cidade: null, morada: null, ativa: true },
  { id: 'e3', nome: 'Porto Centro', cidade: 'Porto', morada: null, ativa: true },
];

const estacoesMock = vi.fn(() => ({ data: ESTACOES }));
vi.mock('@/hooks/useEstacoes', () => ({
  useEstacoes: () => estacoesMock(),
}));

/** A caixa de texto livre só deve existir em modo "Outra cidade…". */
const caixaTexto = () => screen.queryByPlaceholderText('Ex: Lisboa');

const renderCampo = (value: string) =>
  render(<CidadeAssinaturaField value={value} onChange={() => {}} />);

describe('CidadeAssinaturaField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estacoesMock.mockReturnValue({ data: ESTACOES });
  });

  it('sem valor mostra só o seletor', () => {
    renderCampo('');
    expect(caixaTexto()).toBeNull();
  });

  // O bug: escolher uma estação sem `cidade` gravava o NOME da estação, mas a
  // procura de volta era feita só por `cidade`. Não reconhecia o valor, dava-o
  // como texto livre e abria uma SEGUNDA caixa por baixo — dois campos para
  // uma só cidade de assinatura.
  it('valor igual ao NOME de uma estação sem cidade não abre segunda caixa', () => {
    renderCampo('Leiria');
    expect(caixaTexto()).toBeNull();
  });

  it('valor igual à CIDADE de uma estação também não abre segunda caixa', () => {
    renderCampo('Porto');
    expect(caixaTexto()).toBeNull();
  });

  it('valor que não é estação nenhuma continua editável em texto livre', () => {
    renderCampo('Coimbra');
    expect(caixaTexto()).toHaveValue('Coimbra');
  });

  it('sem estações cadastradas mostra só a caixa de texto', () => {
    estacoesMock.mockReturnValue({ data: [] });
    renderCampo('');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(caixaTexto()).not.toBeNull();
  });
});
