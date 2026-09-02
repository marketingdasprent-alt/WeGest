import { describe, it, expect } from 'vitest';
import { calcularValoresDivida, type MovimentoParaDivida } from './calculoDivida';

const PERIODO_INICIO = '2026-08-01';

function mov(
  tipo: 'credito' | 'debito',
  categoria: string | null,
  valor: number,
  status: 'pendente' | 'pago' | 'cancelado' = 'pendente',
  dataMovimento = '2026-08-05' // dentro do período por omissão, salvo indicação em contrário
): MovimentoParaDivida {
  return { tipo, categoria, valor, status, data_movimento: dataMovimento };
}

describe('calcularValoresDivida', () => {
  it('tudo vazio dá quatro zeros', () => {
    expect(calcularValoresDivida([], [], PERIODO_INICIO)).toEqual({
      valorPeriodo: 0,
      valorDanos: 0,
      valorCaucao: 0,
      valorTotal: 0,
    });
  });

  it('período: crédito soma, débito subtrai — categoria fora de reparacao/caucao', () => {
    const periodo = [mov('credito', 'bonus', 100), mov('debito', 'multa', 30)];
    const r = calcularValoresDivida(periodo, [], PERIODO_INICIO);
    expect(r.valorPeriodo).toBe(70);
    expect(r.valorDanos).toBe(0);
    expect(r.valorTotal).toBe(0); // período positivo não entra no total
  });

  it('período negativo entra no total pelo valor absoluto', () => {
    const periodo = [mov('debito', 'outro', 150), mov('credito', 'outro', 20)];
    const r = calcularValoresDivida(periodo, [], PERIODO_INICIO);
    expect(r.valorPeriodo).toBe(-130);
    expect(r.valorTotal).toBe(130);
  });

  it('valor_periodo é saldo corrido: conta movimento anterior ao início do período', () => {
    // Sem chão de início, de propósito — o mesmo critério de
    // motorista_saldo_pendente (Σcrédito − Σdébito pendente até uma data).
    // A query já filtra por data <= fim; aqui só se testa que a função não
    // aplica nenhum chão de início a esta categoria.
    const periodo = [mov('debito', 'outro', 40, 'pendente', '2026-07-10')];
    const r = calcularValoresDivida(periodo, [], PERIODO_INICIO);
    expect(r.valorPeriodo).toBe(-40);
  });

  it('reparacao (débito) entra em valorDanos, não em valorPeriodo', () => {
    const periodo = [mov('debito', 'reparacao', 200)];
    const r = calcularValoresDivida(periodo, [], PERIODO_INICIO);
    expect(r.valorDanos).toBe(200);
    expect(r.valorPeriodo).toBe(0);
    expect(r.valorTotal).toBe(200);
  });

  it('reparação antes do início do período não conta — danos continuam presos ao intervalo', () => {
    const periodo = [mov('debito', 'reparacao', 200, 'pendente', '2026-07-10')];
    const r = calcularValoresDivida(periodo, [], PERIODO_INICIO);
    expect(r.valorDanos).toBe(0);
  });

  it('estorno de reparação (crédito) abate aos danos, sem descer abaixo de zero', () => {
    const periodo = [mov('debito', 'reparacao', 100), mov('credito', 'reparacao', 150)];
    const r = calcularValoresDivida(periodo, [], PERIODO_INICIO);
    expect(r.valorDanos).toBe(0);
  });

  it('caução: crédito soma, débito subtrai — vem só de movimentosCaucao', () => {
    const caucao = [mov('credito', 'caucao', 300), mov('debito', 'dev_caucao', 100)];
    // dev_caucao não é 'caucao' — não deve contar aqui (a categoria tem de
    // ser exactamente 'caucao'; devoluções que usem outra categoria ficam
    // de fora e são um caso a rever separadamente, fora deste cálculo).
    const r = calcularValoresDivida([], caucao, PERIODO_INICIO);
    expect(r.valorCaucao).toBe(300);
  });

  it('caução com categoria caucao em ambos os tipos', () => {
    const caucao = [mov('credito', 'caucao', 300), mov('debito', 'caucao', 100)];
    const r = calcularValoresDivida([], caucao, PERIODO_INICIO);
    expect(r.valorCaucao).toBe(200);
  });

  it('caução pode dar negativo (mais devolvido do que entregue)', () => {
    const caucao = [mov('credito', 'caucao', 50), mov('debito', 'caucao', 200)];
    const r = calcularValoresDivida([], caucao, PERIODO_INICIO);
    expect(r.valorCaucao).toBe(-150);
  });

  it('um movimento de caução dentro de movimentosPeriodo é ignorado', () => {
    // A função só olha para movimentosCaucao quando calcula valorCaucao —
    // mesmo que o mesmo movimento apareça (por a data cair no intervalo) na
    // lista de período, não é aí que conta.
    const periodo = [mov('credito', 'caucao', 999)];
    const r = calcularValoresDivida(periodo, [], PERIODO_INICIO);
    expect(r.valorPeriodo).toBe(0);
    expect(r.valorCaucao).toBe(0);
  });

  it('cancelado não conta em nenhum dos três', () => {
    const periodo = [
      mov('debito', 'outro', 500, 'cancelado'),
      mov('debito', 'reparacao', 500, 'cancelado'),
    ];
    const caucao = [mov('credito', 'caucao', 500, 'cancelado')];
    const r = calcularValoresDivida(periodo, caucao, PERIODO_INICIO);
    expect(r).toEqual({ valorPeriodo: 0, valorDanos: 0, valorCaucao: 0, valorTotal: 0 });
  });

  it('pago não conta em nenhum dos três', () => {
    const periodo = [mov('debito', 'outro', 500, 'pago'), mov('debito', 'reparacao', 500, 'pago')];
    const caucao = [mov('credito', 'caucao', 500, 'pago')];
    const r = calcularValoresDivida(periodo, caucao, PERIODO_INICIO);
    expect(r).toEqual({ valorPeriodo: 0, valorDanos: 0, valorCaucao: 0, valorTotal: 0 });
  });

  it('caução maior que a dívida dá total negativo', () => {
    const periodo = [mov('debito', 'outro', 100)];
    const caucao = [mov('credito', 'caucao', 300)];
    const r = calcularValoresDivida(periodo, caucao, PERIODO_INICIO);
    expect(r.valorTotal).toBe(-200);
  });

  it('total combina período negativo + danos − caução', () => {
    const periodo = [mov('debito', 'outro', 80), mov('debito', 'reparacao', 40)];
    const caucao = [mov('credito', 'caucao', 30)];
    const r = calcularValoresDivida(periodo, caucao, PERIODO_INICIO);
    expect(r.valorPeriodo).toBe(-80);
    expect(r.valorDanos).toBe(40);
    expect(r.valorCaucao).toBe(30);
    expect(r.valorTotal).toBe(90); // 80 + 40 - 30
  });

  it('arredonda a 2 casas decimais sem ruído de vírgula flutuante', () => {
    const periodo = [mov('debito', 'outro', 0.1), mov('debito', 'outro', 0.2)];
    const r = calcularValoresDivida(periodo, [], PERIODO_INICIO);
    expect(r.valorPeriodo).toBe(-0.3);
  });

  it('valor como string numa das listas é convertido correctamente', () => {
    const periodo = [mov('debito', 'outro', '50' as unknown as number)];
    const r = calcularValoresDivida(periodo, [], PERIODO_INICIO);
    expect(r.valorPeriodo).toBe(-50);
  });
});
