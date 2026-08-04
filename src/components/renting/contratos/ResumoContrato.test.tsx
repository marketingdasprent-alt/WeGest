import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResumoContrato } from './ResumoContrato';

// 2026-08-01 → 2026-08-16 = 15 dias; → 2026-08-21 = 20 dias.
const INICIO = '2026-08-01T10:00';
const FIM_15D = '2026-08-16T10:00';
const FIM_20D = '2026-08-21T10:00';

function props(over: Partial<React.ComponentProps<typeof ResumoContrato>> = {}) {
  return {
    dataInicio: INICIO,
    dataFim: FIM_15D,
    tarifaDiaria: 60,
    valorTotalManual: 1275,
    descontoPercentagem: null,
    taxaIva: 23,
    regime: 'rent_a_car',
    editavel: true,
    onValorTotalManualChange: vi.fn(),
    ...over,
  } as React.ComponentProps<typeof ResumoContrato>;
}

describe('ResumoContrato — preco unitario editavel', () => {
  it('mostra o preco/dia derivado do valor manual gravado', () => {
    render(<ResumoContrato {...props()} />);
    expect(screen.getByLabelText('Preço/dia (sem IVA)')).toHaveValue('85.00');
    expect(screen.getByText('× 15 dias')).toBeInTheDocument();
  });

  it('escrever um preco/dia propaga o total (preco x dias)', () => {
    const onChange = vi.fn();
    render(<ResumoContrato {...props({ onValorTotalManualChange: onChange })} />);
    fireEvent.change(screen.getByLabelText('Preço/dia (sem IVA)'), { target: { value: '100' } });
    expect(onChange).toHaveBeenCalledWith(1500);
  });

  it('aceita virgula decimal', () => {
    const onChange = vi.fn();
    render(<ResumoContrato {...props({ onValorTotalManualChange: onChange })} />);
    fireEvent.change(screen.getByLabelText('Preço/dia (sem IVA)'), { target: { value: '90,50' } });
    expect(onChange).toHaveBeenCalledWith(1357.5);
  });

  it('esvaziar o campo volta ao calculo pela tarifa (null)', () => {
    const onChange = vi.fn();
    render(<ResumoContrato {...props({ onValorTotalManualChange: onChange })} />);
    fireEvent.change(screen.getByLabelText('Preço/dia (sem IVA)'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('nao deixa escrever precos negativos — o sinal e descartado', () => {
    const onChange = vi.fn();
    render(<ResumoContrato {...props({ onValorTotalManualChange: onChange })} />);
    const input = screen.getByLabelText('Preço/dia (sem IVA)');
    fireEvent.change(input, { target: { value: '-5' } });
    expect(input).toHaveValue('5');
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it('esticar as datas mantem o preco/dia e recalcula o total', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ResumoContrato {...props({ onValorTotalManualChange: onChange })} />
    );
    expect(screen.getByLabelText('Preço/dia (sem IVA)')).toHaveValue('85.00');

    rerender(
      <ResumoContrato {...props({ dataFim: FIM_20D, onValorTotalManualChange: onChange })} />
    );

    expect(onChange).toHaveBeenCalledWith(1700);
    expect(screen.getByLabelText('Preço/dia (sem IVA)')).toHaveValue('85.00');
  });

  it('escrever antes da hidratacao chegar — o valor gravado tardio nao sobrepoe o que foi escrito', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ResumoContrato {...props({ valorTotalManual: null, onValorTotalManualChange: onChange })} />
    );
    const input = screen.getByLabelText('Preço/dia (sem IVA)');
    fireEvent.change(input, { target: { value: '40' } });
    expect(input).toHaveValue('40');
    expect(onChange).toHaveBeenCalledWith(600);

    // Hidratacao assincrona: o valor gravado chega tarde (depois de o
    // utilizador ja ter escrito) e discorda de propósito do que foi escrito —
    // 1275 / 15 dias = 85.00, bem diferente de 40. Se a guarda `semeado`
    // (ResumoContrato.tsx) falhar e o campo for re-semeado a partir do total,
    // o input passa a mostrar "85.00" e este teste falha sem ambiguidade.
    rerender(
      <ResumoContrato {...props({ valorTotalManual: 1275, onValorTotalManualChange: onChange })} />
    );

    expect(screen.getByLabelText('Preço/dia (sem IVA)')).toHaveValue('40');
  });

  it('mostra a tarifa como placeholder quando nao ha valor manual', () => {
    render(<ResumoContrato {...props({ valorTotalManual: null })} />);
    const input = screen.getByLabelText('Preço/dia (sem IVA)');
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', '60.00');
  });

  it('desativa o campo sem datas definidas', () => {
    render(<ResumoContrato {...props({ dataFim: null, valorTotalManual: null })} />);
    expect(screen.getByLabelText('Preço/dia (sem IVA)')).toBeDisabled();
    expect(screen.getByText(/define as datas primeiro/i)).toBeInTheDocument();
  });

  it('desativa o campo quando o contrato esta faturado', () => {
    render(
      <ResumoContrato
        {...props({
          isFacturado: true,
          totalSnapshot: 1568.25,
          subtotalSnapshot: 1275,
          ivaSnapshot: 293.25,
        })}
      />
    );
    expect(screen.getByLabelText('Preço/dia (sem IVA)')).toBeDisabled();
  });

  it('TVDE usa preco/semana com divisor 1', () => {
    const onChange = vi.fn();
    render(
      <ResumoContrato
        {...props({
          regime: 'tvde',
          taxaIva: 0,
          dataFim: null,
          valorTotalManual: 210,
          onValorTotalManualChange: onChange,
        })}
      />
    );
    const input = screen.getByLabelText('Preço/semana (IVA inc.)');
    expect(input).toHaveValue('210.00');
    fireEvent.change(input, { target: { value: '250' } });
    expect(onChange).toHaveBeenCalledWith(250);
  });

  it('sem editavel mantem-se so-leitura', () => {
    render(<ResumoContrato {...props({ editavel: false })} />);
    expect(screen.queryByLabelText('Preço/dia (sem IVA)')).not.toBeInTheDocument();
    expect(screen.getByText('Valor manual')).toBeInTheDocument();
  });
});
