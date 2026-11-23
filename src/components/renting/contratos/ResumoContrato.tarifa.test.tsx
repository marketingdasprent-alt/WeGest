import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ResumoContrato } from './ResumoContrato';

/**
 * Sem valor acordado, o total do cartão tem de dizer o que se grava: o preço
 * da tarifa para o modelo (calcularBaseAluguerRenting). Fazia tarifa_diaria ×
 * dias, que num TVDE dá 0 € enquanto o quadro da tarifa mostra o preço semanal.
 */
function renderTvde(over: Partial<React.ComponentProps<typeof ResumoContrato>> = {}) {
  render(
    <ResumoContrato
      dataInicio="2026-10-06T10:57"
      dataFim={null}
      tarifaDiaria={null}
      valorTotalManual={null}
      descontoPercentagem={null}
      taxaIva={0}
      regime="tvde"
      {...over}
    />
  );
}

const total = () => screen.getAllByText(/€/).map((el) => el.textContent ?? '');

describe('ResumoContrato — total pela tarifa', () => {
  it('TVDE sem valor acordado: o total é o preço da tarifa, não 0 €', () => {
    renderTvde({ baseAluguerTarifa: 275 });
    // Cabeçalho do cartão e linha "Total": os dois com o preço da tarifa.
    expect(total().filter((t) => t.includes('275,00')).length).toBeGreaterThanOrEqual(2);
  });

  it('com valor acordado, é esse que manda', () => {
    renderTvde({ baseAluguerTarifa: 275, valorTotalManual: 300 });
    expect(total().some((t) => t.includes('300,00'))).toBe(true);
    expect(total().some((t) => t.includes('275,00'))).toBe(false);
  });
});

describe('ResumoContrato — TVDE gravado mostra o que o fecho cobra', () => {
  it('manual 225 desactualizado: valor semanal 275 e linha à parte para o cliente', () => {
    renderTvde({
      editavel: false,
      valorTotalManual: 225,
      precoSemanalTvde: { valor: 275, origem: 'tarifa' },
    });
    expect(screen.getByText('Valor semanal (motorista)')).toBeInTheDocument();
    expect(screen.getByText('Faturar ao cliente')).toBeInTheDocument();
    expect(screen.queryByText('Valor semanal')).toBeNull();
  });

  it('sem manual, o total sai do preço semanal e não de 0 €', () => {
    renderTvde({ editavel: false, precoSemanalTvde: { valor: 275, origem: 'tarifa' } });
    expect(total().filter((t) => t.includes('275,00')).length).toBeGreaterThanOrEqual(2);
  });

  it('rent-a-car ignora o preço semanal', () => {
    renderTvde({
      regime: 'rent_a_car',
      editavel: false,
      valorTotalManual: 1275,
      precoSemanalTvde: { valor: 275, origem: 'tarifa' },
    });
    expect(screen.queryByText('Valor semanal (motorista)')).toBeNull();
  });

  it('a carregar e sem manual: o total é um traço, não 0 €', () => {
    renderTvde({ editavel: false, precoSemanalTvdeCarregando: true });
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('A carregar…')).toBeInTheDocument();
  });

  it('sem preço nenhum e sem manual: o total é um traço, não um valor que o fecho não cobra', () => {
    renderTvde({ editavel: false, precoSemanalTvde: { valor: null, origem: 'sem-preco' } });
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('erro de leitura mostra o erro em vez do valor manual desactualizado', () => {
    renderTvde({ editavel: false, valorTotalManual: 225, precoSemanalTvdeErro: true });
    expect(screen.getByText('Erro a ler o preço')).toBeInTheDocument();
  });
});
