import { describe, it, expect } from 'vitest';
import { calcularValoresDivida, type MovimentoParaDivida } from './calculoDivida';

function mov(
  tipo: 'credito' | 'debito',
  categoria: string | null,
  valor: number,
  status: 'pendente' | 'pago' | 'cancelado' = 'pendente'
): MovimentoParaDivida {
  return { tipo, categoria, valor, status };
}

describe('calcularValoresDivida', () => {
  it('tudo vazio dá quatro zeros', () => {
    expect(calcularValoresDivida([], [])).toEqual({
      valorPeriodo: 0,
      valorDanos: 0,
      valorCaucao: 0,
      valorTotal: 0,
    });
  });

  it('período: crédito soma, débito subtrai — categoria fora de reparacao/caucao', () => {
    const periodo = [mov('credito', 'bonus', 100), mov('debito', 'multa', 30)];
    const r = calcularValoresDivida(periodo, []);
    expect(r.valorPeriodo).toBe(70);
    expect(r.valorDanos).toBe(0);
    expect(r.valorTotal).toBe(0); // período positivo não entra no total
  });

  it('período negativo entra no total pelo valor absoluto', () => {
    const periodo = [mov('debito', 'outro', 150), mov('credito', 'outro', 20)];
    const r = calcularValoresDivida(periodo, []);
    expect(r.valorPeriodo).toBe(-130);
    expect(r.valorTotal).toBe(130);
  });

  it('reparacao (débito) entra em valorDanos, não em valorPeriodo', () => {
    const periodo = [mov('debito', 'reparacao', 200)];
    const r = calcularValoresDivida(periodo, []);
    expect(r.valorDanos).toBe(200);
    expect(r.valorPeriodo).toBe(0);
    expect(r.valorTotal).toBe(200);
  });

  it('estorno de reparação (crédito) abate aos danos, sem descer abaixo de zero', () => {
    const periodo = [mov('debito', 'reparacao', 100), mov('credito', 'reparacao', 150)];
    const r = calcularValoresDivida(periodo, []);
    expect(r.valorDanos).toBe(0);
  });

  it('caução: só o crédito conta — vem só de movimentosCaucao', () => {
    const caucao = [mov('credito', 'caucao', 300), mov('debito', 'dev_caucao', 100)];
    // dev_caucao não é 'caucao' — não deve contar aqui de qualquer forma (a
    // categoria tem de ser exactamente 'caucao').
    const r = calcularValoresDivida([], caucao);
    expect(r.valorCaucao).toBe(300);
  });

  it('um débito de categoria caucao não abate ao valor atribuído', () => {
    // Um débito 'caucao' não é devolução (isso seria dev_caucao) — na
    // prática é uma parcela da própria caução ainda por pagar (ex.:
    // "restante da caução 1/2"). Não é dinheiro que já saiu da caução detida,
    // por isso não abate: o valor atribuído continua a ser só o crédito.
    const caucao = [mov('credito', 'caucao', 300), mov('debito', 'caucao', 100)];
    const r = calcularValoresDivida([], caucao);
    expect(r.valorCaucao).toBe(300);
  });

  it('vários créditos de caução somam-se', () => {
    const caucao = [mov('credito', 'caucao', 50), mov('credito', 'caucao', 200)];
    const r = calcularValoresDivida([], caucao);
    expect(r.valorCaucao).toBe(250);
  });

  it('só débito de caução (sem crédito) dá zero', () => {
    const caucao = [mov('debito', 'caucao', 200)];
    const r = calcularValoresDivida([], caucao);
    expect(r.valorCaucao).toBe(0);
  });

  it('um movimento de caução dentro de movimentosPeriodo é ignorado', () => {
    // A função só olha para movimentosCaucao quando calcula valorCaucao —
    // mesmo que o mesmo movimento apareça (por a data cair no intervalo) na
    // lista de período, não é aí que conta.
    const periodo = [mov('credito', 'caucao', 999)];
    const r = calcularValoresDivida(periodo, []);
    expect(r.valorPeriodo).toBe(0);
    expect(r.valorCaucao).toBe(0);
  });

  it('cancelado não conta em nenhum dos três', () => {
    const periodo = [
      mov('debito', 'outro', 500, 'cancelado'),
      mov('debito', 'reparacao', 500, 'cancelado'),
    ];
    const caucao = [mov('credito', 'caucao', 500, 'cancelado')];
    const r = calcularValoresDivida(periodo, caucao);
    expect(r).toEqual({ valorPeriodo: 0, valorDanos: 0, valorCaucao: 0, valorTotal: 0 });
  });

  it('pago não conta em nenhum dos três', () => {
    const periodo = [mov('debito', 'outro', 500, 'pago'), mov('debito', 'reparacao', 500, 'pago')];
    const caucao = [mov('credito', 'caucao', 500, 'pago')];
    const r = calcularValoresDivida(periodo, caucao);
    expect(r).toEqual({ valorPeriodo: 0, valorDanos: 0, valorCaucao: 0, valorTotal: 0 });
  });

  it('caução maior que a dívida dá total negativo', () => {
    const periodo = [mov('debito', 'outro', 100)];
    const caucao = [mov('credito', 'caucao', 300)];
    const r = calcularValoresDivida(periodo, caucao);
    expect(r.valorTotal).toBe(-200);
  });

  it('total combina período negativo + danos − caução', () => {
    const periodo = [mov('debito', 'outro', 80), mov('debito', 'reparacao', 40)];
    const caucao = [mov('credito', 'caucao', 30)];
    const r = calcularValoresDivida(periodo, caucao);
    expect(r.valorPeriodo).toBe(-80);
    expect(r.valorDanos).toBe(40);
    expect(r.valorCaucao).toBe(30);
    expect(r.valorTotal).toBe(90); // 80 + 40 - 30
  });

  it('arredonda a 2 casas decimais sem ruído de vírgula flutuante', () => {
    const periodo = [mov('debito', 'outro', 0.1), mov('debito', 'outro', 0.2)];
    const r = calcularValoresDivida(periodo, []);
    expect(r.valorPeriodo).toBe(-0.3);
  });

  it('valor como string numa das listas é convertido correctamente', () => {
    const periodo = [mov('debito', 'outro', '50' as unknown as number)];
    const r = calcularValoresDivida(periodo, []);
    expect(r.valorPeriodo).toBe(-50);
  });
});
