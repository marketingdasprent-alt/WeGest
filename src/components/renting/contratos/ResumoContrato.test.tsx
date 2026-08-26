import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { ResumoContrato } from './ResumoContrato';
import { formatCurrency } from './contratosUtils';

type Props = React.ComponentProps<typeof ResumoContrato>;

// 2026-08-01 → 2026-08-16 = 15 dias; → 2026-08-21 = 20 dias.
const INICIO = '2026-08-01T10:00';
const FIM_15D = '2026-08-16T10:00';
const FIM_20D = '2026-08-21T10:00';

const LABEL = 'Preço/dia (sem IVA)';
const campo = (label: string = LABEL) => screen.getByLabelText(label);

function props(over: Partial<Props> = {}) {
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
  } as Props;
}

/**
 * Desenha o cartão com o circuito FECHADO: o que ele escreve por
 * `onValorTotalManualChange` volta a entrar como adereço `valorTotalManual`,
 * que é o que o formulário real faz (`form.setValue` + `form.watch` em
 * ContratoForm.tsx). Com um `rerender` normal o valor fica congelado e os
 * testes deixam de conseguir distinguir um cartão que segue o formulário de um
 * que o ignora.
 *
 * Nota sobre o foco: `fireEvent.change` não dá foco ao campo, mas num browser
 * ninguém escreve num input sem o focar. Os testes de escrita disparam `focus`
 * primeiro, senão estariam a testar um estado que não existe.
 */
function renderCircuito(base: Partial<Props> = {}) {
  const onChange = vi.fn();
  let escrever!: (valor: number | null) => void;

  const Circuito: React.FC<{ extra: Partial<Props> }> = ({ extra }) => {
    const [valor, setValor] = useState<number | null>(
      base.valorTotalManual === undefined ? 1275 : (base.valorTotalManual ?? null)
    );
    escrever = setValor;
    return (
      <ResumoContrato
        {...props({ ...base, ...extra })}
        valorTotalManual={valor}
        onValorTotalManualChange={(v) => {
          onChange(v);
          setValor(v);
        }}
      />
    );
  };

  const { rerender } = render(<Circuito extra={{}} />);

  return {
    onChange,
    /** Escrita vinda de FORA do cartão: hidratação ou `aplicarDadosViatura`. */
    escreverDeFora: (valor: number | null) => act(() => escrever(valor)),
    /** Muda os outros adereços (datas, regime...) sem tocar no valor gravado. */
    mudarProps: (extra: Partial<Props> = {}) => rerender(<Circuito extra={extra} />),
  };
}

describe('ResumoContrato — preco unitario editavel', () => {
  it('mostra o preco/dia derivado do valor manual gravado', () => {
    render(<ResumoContrato {...props()} />);
    expect(campo()).toHaveValue('85.00');
    expect(screen.getByText('× 15 dias')).toBeInTheDocument();
  });

  it('escrever um preco/dia propaga o total (preco x dias)', () => {
    const c = renderCircuito();
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '100' } });
    expect(c.onChange).toHaveBeenCalledWith(1500);
    expect(campo()).toHaveValue('100');
  });

  it('aceita virgula decimal', () => {
    const c = renderCircuito();
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '90,50' } });
    expect(c.onChange).toHaveBeenCalledWith(1357.5);
  });

  it('esvaziar o campo volta ao calculo pela tarifa (null)', () => {
    const c = renderCircuito();
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '' } });
    expect(c.onChange).toHaveBeenCalledWith(null);
    expect(campo()).toHaveValue('');
  });

  it('nao deixa escrever precos negativos — o sinal e descartado', () => {
    const c = renderCircuito();
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '-5' } });
    expect(campo()).toHaveValue('5');
    expect(c.onChange).toHaveBeenCalledWith(75);
  });

  it('sair do campo formata o preco com 2 casas', () => {
    renderCircuito();
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '90,5' } });
    expect(campo()).toHaveValue('90.5');
    fireEvent.blur(campo());
    expect(campo()).toHaveValue('90.50');
  });

  it('escrever 0 limpa o campo ao sair, mas o valor gravado fica a 0', () => {
    const c = renderCircuito();
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '0' } });
    expect(c.onChange).toHaveBeenLastCalledWith(0);
    fireEvent.blur(campo());
    // O campo esvazia-se (0 não é um preço válido para mostrar) mas o
    // formulário fica com 0 gravado, não com null — e 0 conta como "sem valor
    // manual" no cálculo. Comportamento de hoje, fixado aqui para não mudar
    // por acidente.
    expect(campo()).toHaveValue('');
    expect(c.onChange).toHaveBeenLastCalledWith(0);
  });

  it('esticar as datas mantem o preco/dia e recalcula o total', () => {
    const c = renderCircuito();
    expect(campo()).toHaveValue('85.00');

    c.mudarProps({ dataFim: FIM_20D });

    expect(c.onChange).toHaveBeenCalledWith(1700);
    expect(campo()).toHaveValue('85.00');
    expect(screen.getByText('× 20 dias')).toBeInTheDocument();
  });

  it('nunca re-deriva o preco/dia a partir de um total desactualizado', () => {
    // O cartão pode ser desenhado sem callback (`onValorTotalManualChange` é
    // opcional) — ou seja, com um total que nunca acompanha o novo divisor.
    // Mesmo assim, mudar as datas não pode mexer no preço/dia: derivá-lo do
    // total antigo daria 1275/20 = 63,75, que é o comportamento do cartão da
    // RESERVA (lá manda o total) e o oposto do que este promete.
    const semCallback = () => props({ dataFim: FIM_15D, onValorTotalManualChange: undefined });
    const { rerender } = render(<ResumoContrato {...semCallback()} />);
    expect(campo()).toHaveValue('85.00');

    rerender(<ResumoContrato {...semCallback()} dataFim={FIM_20D} />);

    expect(campo()).toHaveValue('85.00');
  });

  it('valor escrito de fora (troca de viatura) actualiza o preco/dia mostrado', () => {
    // Substitui o antigo teste da "corrida de hidratação", que defendia um
    // estado inalcançável: antes da hidratação as datas são '' → divisor 0 →
    // campo desativado; e em edição a página só monta o cartão depois de o
    // contrato carregar (spinner em ContratoForm.tsx). O cenário real é este —
    // `aplicarDadosViatura` reescrever `valor_total_manual` ao trocar de
    // viatura, que é alcançável em edição (`viaturaLocked` só tranca a criação
    // a partir de reserva).
    const c = renderCircuito();
    expect(campo()).toHaveValue('85.00');

    c.escreverDeFora(1050); // viatura nova: grupo a 70 €/dia × 15 dias

    expect(campo()).toHaveValue('70.00');

    // E a partir daqui é a tarifa NOVA que manda: esticar as datas tem de dar
    // 70 × 20 = 1400, não 85 × 20 = 1700.
    c.mudarProps({ dataFim: FIM_20D });
    expect(c.onChange).toHaveBeenLastCalledWith(1400);
    expect(campo()).toHaveValue('70.00');
  });

  it('enquanto o campo esta em foco, um valor vindo de fora nao lhe toca', () => {
    const c = renderCircuito();
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '4' } });

    c.escreverDeFora(1275); // 1275 / 15 = 85.00, bem diferente de 4

    expect(campo()).toHaveValue('4');

    // Fora do foco o formulário volta a mandar.
    fireEvent.blur(campo());
    c.escreverDeFora(1050);
    expect(campo()).toHaveValue('70.00');
  });

  it('nao escreve no formulario sem ninguem tocar em nada', () => {
    const c = renderCircuito();
    expect(campo()).toHaveValue('85.00');
    expect(c.onChange).not.toHaveBeenCalled();

    c.mudarProps(); // re-render sem interação nenhuma
    expect(c.onChange).not.toHaveBeenCalled();
  });

  it('mudar as datas sem preco escrito nao inventa um valor manual', () => {
    const c = renderCircuito({ valorTotalManual: null });
    expect(campo()).toHaveValue('');

    c.mudarProps({ dataFim: FIM_20D });

    expect(c.onChange).not.toHaveBeenCalled();
    expect(campo()).toHaveValue('');
  });

  it('nao promete o preco da tarifa — placeholder neutro, sem tooltip a sugeri-la', () => {
    // `tarifa_diaria` nunca é preenchido por contratos criados na aplicação,
    // por isso mostrá-la como valor por omissão seria uma promessa falsa:
    // esvaziar o campo dá Total 0,00 €.
    render(<ResumoContrato {...props({ valorTotalManual: null })} />);
    expect(campo()).toHaveValue('');
    expect(campo()).toHaveAttribute('placeholder', '0,00');
    expect(campo()).not.toHaveAttribute('title');
  });

  it('desativa o campo sem datas definidas', () => {
    render(<ResumoContrato {...props({ dataFim: null, valorTotalManual: null })} />);
    expect(campo()).toBeDisabled();
    expect(campo()).toHaveAttribute('title', 'Define primeiro as datas');
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
    expect(campo()).toBeDisabled();
  });

  it('TVDE usa preco/semana com divisor 1', () => {
    const c = renderCircuito({
      regime: 'tvde',
      taxaIva: 0,
      dataFim: null,
      valorTotalManual: 210,
    });
    const label = 'Preço/semana (IVA inc.)';
    expect(campo(label)).toHaveValue('210.00');
    fireEvent.focus(campo(label));
    fireEvent.change(campo(label), { target: { value: '250' } });
    expect(c.onChange).toHaveBeenCalledWith(250);
  });

  it('sem editavel mantem-se so-leitura', () => {
    render(<ResumoContrato {...props({ editavel: false })} />);
    expect(screen.queryByLabelText(LABEL)).not.toBeInTheDocument();
    expect(screen.getByText('Valor manual')).toBeInTheDocument();
  });
});

describe('ResumoContrato — desconto gravado continua a contar', () => {
  it('aplica o desconto ao total mesmo sem campo no formulario', () => {
    render(<ResumoContrato {...props({ descontoPercentagem: 10 })} />);
    // 1275 − 10% = 1147,50 · IVA 23% = 263,93 · total 1411,43
    expect(screen.getByText('Desconto (10%)')).toBeInTheDocument();
    // O total aparece 2x (resumo no topo + linha "Total" do detalhe), daí
    // getAllByText. E comparamos já normalizado: o Intl.NumberFormat pt-PT
    // mete um espaço insecável (NBSP) antes do "€", o normalizador do
    // testing-library só limpa isso no texto do DOM, nunca no matcher que
    // lhe passamos — uma string literal com formatCurrency() nunca bateria
    // certo, mesmo com o número correto.
    const totalEsperado = formatCurrency(1411.43).replace(/\s+/g, ' ');
    expect(screen.getAllByText((content) => content === totalEsperado).length).toBeGreaterThan(0);
  });
});
