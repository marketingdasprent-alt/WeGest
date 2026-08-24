import { describe, expect, it } from 'vitest';
import { calcularResumoMovimentos } from './resumoMovimentos';

describe('calcularResumoMovimentos', () => {
  it('não conta como dívida um débito já pago', () => {
    // O caso real: motorista com cinco débitos, todos liquidados. O cartão
    // mostrava 725,00 € a vermelho ao lado de "Saldo Pendente 0,00 €".
    const resumo = calcularResumoMovimentos([
      { tipo: 'debito', valor: 150, status: 'pago' },
      { tipo: 'debito', valor: 150, status: 'pago' },
      { tipo: 'debito', valor: 150, status: 'pago' },
      { tipo: 'debito', valor: 125, status: 'pago' },
      { tipo: 'debito', valor: 150, status: 'pago' },
    ]);

    expect(resumo.debitos).toBe(0);
    expect(resumo.acumuladoDebitos).toBe(725);
  });

  it('conta nos cartões apenas o que está pendente', () => {
    const resumo = calcularResumoMovimentos([
      { tipo: 'debito', valor: 100, status: 'pendente' },
      { tipo: 'debito', valor: 250, status: 'pago' },
      { tipo: 'credito', valor: 40, status: 'pendente' },
      { tipo: 'credito', valor: 60, status: 'pago' },
    ]);

    expect(resumo.debitos).toBe(100);
    expect(resumo.creditos).toBe(40);
    expect(resumo.acumuladoDebitos).toBe(350);
    expect(resumo.acumuladoCreditos).toBe(100);
  });

  it('ignora cancelados nos quatro totais', () => {
    const resumo = calcularResumoMovimentos([
      { tipo: 'debito', valor: 125, status: 'cancelado' },
      { tipo: 'credito', valor: 30, status: 'cancelado' },
      { tipo: 'debito', valor: 75, status: 'pendente' },
    ]);

    expect(resumo.debitos).toBe(75);
    expect(resumo.acumuladoDebitos).toBe(75);
    expect(resumo.creditos).toBe(0);
    expect(resumo.acumuladoCreditos).toBe(0);
  });

  it('fecha com o saldo pendente: créditos menos débitos', () => {
    // O RPC motorista_saldo_pendente soma créditos e subtrai débitos, sobre
    // status = 'pendente'. Os cartões têm de dar o mesmo, senão voltam a
    // contar coisas diferentes lado a lado.
    const movimentos = [
      { tipo: 'debito', valor: 125, status: 'pendente' },
      { tipo: 'credito', valor: 200, status: 'pendente' },
      { tipo: 'debito', valor: 999, status: 'pago' },
      { tipo: 'credito', valor: 999, status: 'cancelado' },
    ];
    const resumo = calcularResumoMovimentos(movimentos);

    const saldoEsperado = movimentos
      .filter((m) => m.status === 'pendente')
      .reduce((total, m) => total + (m.tipo === 'credito' ? m.valor : -m.valor), 0);

    expect(resumo.creditos - resumo.debitos).toBe(saldoEsperado);
    expect(resumo.creditos - resumo.debitos).toBe(75);
  });

  it('aceita valores em texto, como vêm do Supabase', () => {
    const resumo = calcularResumoMovimentos([
      { tipo: 'debito', valor: '150.00', status: 'pendente' },
      { tipo: 'credito', valor: '25.50', status: 'pendente' },
    ]);

    expect(resumo.debitos).toBe(150);
    expect(resumo.creditos).toBe(25.5);
  });

  it('um valor inválido não contamina o total com NaN', () => {
    const resumo = calcularResumoMovimentos([
      { tipo: 'debito', valor: 100, status: 'pendente' },
      { tipo: 'debito', valor: 'não é número', status: 'pendente' },
    ]);

    expect(resumo.debitos).toBe(100);
  });

  it('lista vazia dá zeros, não NaN', () => {
    expect(calcularResumoMovimentos([])).toEqual({
      creditos: 0,
      debitos: 0,
      acumuladoCreditos: 0,
      acumuladoDebitos: 0,
    });
  });
});
