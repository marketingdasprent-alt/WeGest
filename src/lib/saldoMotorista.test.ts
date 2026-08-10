import { describe, it, expect } from 'vitest';
import { legendaSaldoMotorista } from './saldoMotorista';

describe('legendaSaldoMotorista', () => {
  it('tom positivo quando o motorista tem saldo a favor', () => {
    const r = legendaSaldoMotorista(125.5);
    expect(r.tone).toBe('positivo');
    expect(r.texto).toContain('disponível para levantamento');
    expect(r.texto).toContain('125,50');
  });

  it('tom negativo quando o motorista deve', () => {
    const r = legendaSaldoMotorista(-80);
    expect(r.tone).toBe('negativo');
    expect(r.texto).toContain('em dívida');
    expect(r.texto).toContain('80,00');
    expect(r.texto).not.toContain('-80,00'); // mostra o valor absoluto
  });

  it('tom neutro quando o saldo é exactamente 0', () => {
    const r = legendaSaldoMotorista(0);
    expect(r.tone).toBe('neutro');
    expect(r.texto).toBe('Tudo regularizado');
  });

  it('trata resíduos de arredondamento (< 0,005€) como neutro', () => {
    expect(legendaSaldoMotorista(0.004).tone).toBe('neutro');
    expect(legendaSaldoMotorista(-0.004).tone).toBe('neutro');
  });

  it('fronteira: 0,005€ exactos ainda contam como neutro (comparação estrita)', () => {
    expect(legendaSaldoMotorista(0.005).tone).toBe('neutro');
    expect(legendaSaldoMotorista(-0.005).tone).toBe('neutro');
  });

  it('valores acima da fronteira já contam como positivo/negativo', () => {
    expect(legendaSaldoMotorista(0.01).tone).toBe('positivo');
    expect(legendaSaldoMotorista(-0.01).tone).toBe('negativo');
  });
});
