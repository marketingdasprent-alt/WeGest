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
    expect(calcularValoresDivida(0, [], [])).toEqual({
      valorPeriodo: 0,
      valorDanos: 0,
      valorCaucao: 0,
      valorTotal: 0,
    });
  });

  it('o saldo passa tal e qual — não é recalculado aqui', () => {
    const r = calcularValoresDivida(1135, [], []);
    expect(r.valorPeriodo).toBe(1135);
  });

  it('saldo positivo não entra no total', () => {
    const r = calcularValoresDivida(500, [], []);
    expect(r.valorTotal).toBe(0);
  });

  it('saldo negativo entra no total pelo valor absoluto', () => {
    const r = calcularValoresDivida(-130, [], []);
    expect(r.valorTotal).toBe(130);
  });

  it('reparacao (débito) entra em valorDanos', () => {
    const danos = [mov('debito', 'reparacao', 200)];
    const r = calcularValoresDivida(0, danos, []);
    expect(r.valorDanos).toBe(200);
    expect(r.valorTotal).toBe(200);
  });

  it('só reparacao conta para danos — outras categorias são ignoradas', () => {
    const danos = [mov('debito', 'multa', 500), mov('debito', 'reparacao', 40)];
    const r = calcularValoresDivida(0, danos, []);
    expect(r.valorDanos).toBe(40);
  });

  it('estorno de reparação (crédito) abate aos danos, sem descer abaixo de zero', () => {
    const danos = [mov('debito', 'reparacao', 100), mov('credito', 'reparacao', 150)];
    const r = calcularValoresDivida(0, danos, []);
    expect(r.valorDanos).toBe(0);
  });

  it('caução: crédito soma, débito subtrai — só categoria caucao', () => {
    const caucao = [mov('credito', 'caucao', 300), mov('debito', 'dev_caucao', 100)];
    // dev_caucao não é 'caucao' — não conta aqui (a categoria tem de ser
    // exactamente 'caucao').
    const r = calcularValoresDivida(0, [], caucao);
    expect(r.valorCaucao).toBe(300);
  });

  it('caução com categoria caucao em ambos os tipos', () => {
    const caucao = [mov('credito', 'caucao', 300), mov('debito', 'caucao', 100)];
    const r = calcularValoresDivida(0, [], caucao);
    expect(r.valorCaucao).toBe(200);
  });

  it('caução pode dar negativo (mais devolvido do que entregue)', () => {
    const caucao = [mov('credito', 'caucao', 50), mov('debito', 'caucao', 200)];
    const r = calcularValoresDivida(0, [], caucao);
    expect(r.valorCaucao).toBe(-150);
  });

  it('cancelado não conta nem em danos nem em caução', () => {
    const danos = [mov('debito', 'reparacao', 500, 'cancelado')];
    const caucao = [mov('credito', 'caucao', 500, 'cancelado')];
    const r = calcularValoresDivida(0, danos, caucao);
    expect(r).toEqual({ valorPeriodo: 0, valorDanos: 0, valorCaucao: 0, valorTotal: 0 });
  });

  it('pago não conta nem em danos nem em caução', () => {
    const danos = [mov('debito', 'reparacao', 500, 'pago')];
    const caucao = [mov('credito', 'caucao', 500, 'pago')];
    const r = calcularValoresDivida(0, danos, caucao);
    expect(r).toEqual({ valorPeriodo: 0, valorDanos: 0, valorCaucao: 0, valorTotal: 0 });
  });

  it('caução maior que a dívida dá total negativo', () => {
    const caucao = [mov('credito', 'caucao', 300)];
    const r = calcularValoresDivida(-100, [], caucao);
    expect(r.valorTotal).toBe(-200);
  });

  it('total combina saldo negativo + danos − caução', () => {
    const danos = [mov('debito', 'reparacao', 40)];
    const caucao = [mov('credito', 'caucao', 30)];
    const r = calcularValoresDivida(-80, danos, caucao);
    expect(r.valorPeriodo).toBe(-80);
    expect(r.valorDanos).toBe(40);
    expect(r.valorCaucao).toBe(30);
    expect(r.valorTotal).toBe(90); // 80 + 40 - 30
  });

  it('arredonda a 2 casas decimais sem ruído de vírgula flutuante', () => {
    const danos = [mov('debito', 'reparacao', 0.1), mov('debito', 'reparacao', 0.2)];
    const r = calcularValoresDivida(0, danos, []);
    expect(r.valorDanos).toBe(0.3);
  });

  it('valor como string é convertido correctamente', () => {
    const danos = [mov('debito', 'reparacao', '50' as unknown as number)];
    const r = calcularValoresDivida(0, danos, []);
    expect(r.valorDanos).toBe(50);
  });
});
