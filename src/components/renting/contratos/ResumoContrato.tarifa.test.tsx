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
