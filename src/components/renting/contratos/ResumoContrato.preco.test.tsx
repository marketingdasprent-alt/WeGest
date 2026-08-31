import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ResumoContrato } from './ResumoContrato';

/**
 * O preço escrito no cartão TEM de chegar ao formulário.
 *
 * O cartão mostra "Preço/dia" mas o formulário guarda o TOTAL: a conversão é
 * `preço × dias`. Quando o número de dias não dá para calcular — datas por
 * preencher, ou data de fim igual/anterior à de início, que em `calcDias` dá 0 —
 * não há total nenhum a escrever. O que não pode acontecer é o campo aceitar o
 * que a pessoa escreve, mostrá-lo no ecrã e não o gravar: era a queixa "no ecrã
 * estava certo, só ao gravar é que muda".
 */
function renderCartao(over: Partial<React.ComponentProps<typeof ResumoContrato>> = {}) {
  const onValorTotalManualChange = vi.fn();
  render(
    <ResumoContrato
      dataInicio="2026-09-01T10:00"
      dataFim="2026-09-11T10:00"
      tarifaDiaria={null}
      valorTotalManual={null}
      descontoPercentagem={null}
      taxaIva={23}
      regime="rent_a_car"
      editavel
      onValorTotalManualChange={onValorTotalManualChange}
      {...over}
    />
  );
  return { onValorTotalManualChange };
}

function campoPreco(): HTMLInputElement {
  return screen.getByLabelText('Preço/dia (sem IVA)') as HTMLInputElement;
}

describe('ResumoContrato — o preço escrito tem de chegar ao formulário', () => {
  it('com datas válidas converte preço/dia em total', () => {
    const { onValorTotalManualChange } = renderCartao();

    fireEvent.change(campoPreco(), { target: { value: '50' } });

    // 10 dias × 50 = 500.
    expect(onValorTotalManualChange).toHaveBeenCalledWith(500);
  });

  // Mesmo dia = 0 dias, e sem dias não há total a escrever. O campo desactiva-se
  // em vez de aceitar um valor que não conseguiria gravar. Esta é a garantia que
  // impede o "escrevi, vi no ecrã, e não ficou".
  it('não engole o preço quando o contrato começa e acaba no mesmo instante', () => {
    const { onValorTotalManualChange } = renderCartao({
      dataInicio: '2026-09-01T10:00',
      dataFim: '2026-09-01T10:00',
    });

    const input = campoPreco();
    if (!input.disabled) {
      fireEvent.change(input, { target: { value: '50' } });
      expect(
        onValorTotalManualChange,
        'o campo aceitou o preço mas nunca o comunicou ao formulário'
      ).toHaveBeenCalled();
    }
    // Desactivar o campo é a outra saída aceitável: não promete o que não cumpre.
    expect(input.disabled || onValorTotalManualChange.mock.calls.length > 0).toBe(true);
  });

  it('não engole o preço quando a data de fim ainda não está preenchida', () => {
    const { onValorTotalManualChange } = renderCartao({ dataFim: '' });

    const input = campoPreco();
    if (!input.disabled) {
      fireEvent.change(input, { target: { value: '50' } });
      expect(
        onValorTotalManualChange,
        'o campo aceitou o preço mas nunca o comunicou ao formulário'
      ).toHaveBeenCalled();
    }
    expect(input.disabled || onValorTotalManualChange.mock.calls.length > 0).toBe(true);
  });
});
