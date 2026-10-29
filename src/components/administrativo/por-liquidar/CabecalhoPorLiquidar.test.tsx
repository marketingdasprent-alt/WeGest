import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CabecalhoPorLiquidar } from './CabecalhoPorLiquidar';

const renderCabecalho = (
  de: string,
  ate: string,
  resumo = { total: 73301.47, clientes: 36, faturas: 83 }
) =>
  render(
    <CabecalhoPorLiquidar
      de={de}
      ate={ate}
      onPeriodoChange={() => {}}
      pesquisa=""
      onPesquisaChange={() => {}}
      onExportar={() => {}}
      resumo={resumo}
    />
  );

describe('CabecalhoPorLiquidar', () => {
  it('mostra o resumo numa frase: total, clientes e faturas', () => {
    renderCabecalho('', '');
    expect(screen.getByText(/36 clientes · 83 faturas/)).toBeTruthy();
  });

  it('enquanto carrega não mostra números', () => {
    render(
      <CabecalhoPorLiquidar
        de=""
        ate=""
        onPeriodoChange={() => {}}
        pesquisa=""
        onPesquisaChange={() => {}}
        onExportar={() => {}}
        resumo={null}
      />
    );
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText(/clientes/)).toBeNull();
  });

  it('com um atalho, as datas ficam escondidas', () => {
    renderCabecalho('', '');
    expect(screen.queryByLabelText('De')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Período' }).textContent).toContain('Desde sempre');
  });

  it('com datas à mão, mostra-as para se poderem mudar', () => {
    renderCabecalho('2026-10-05', '2026-10-20');
    expect(screen.getByLabelText('De')).toBeTruthy();
    expect(screen.getByLabelText('Até')).toBeTruthy();
  });

  it('sem faturas não deixa exportar', () => {
    renderCabecalho('', '', { total: 0, clientes: 0, faturas: 0 });
    expect(
      (screen.getByRole('button', { name: /Exportar Excel/ }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
