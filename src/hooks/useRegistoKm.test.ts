import { describe, it, expect } from 'vitest';
import { validarKm, avisoSalto } from './useRegistoKm';

describe('validarKm', () => {
  it('exige um número', () => {
    expect(validarKm(null, 1000)).toMatch(/indique/i);
    expect(validarKm(NaN, 1000)).toMatch(/indique/i);
  });

  it('recusa zero e negativos — um odómetro nunca está a zero num carro em uso', () => {
    expect(validarKm(0, null)).toMatch(/maiores que zero/i);
    expect(validarKm(-5, null)).toMatch(/maiores que zero/i);
  });

  it('recusa decimais: o totalizador é inteiro, o parcial é que tem casas', () => {
    expect(validarKm(1000.5, null)).toMatch(/inteiro/i);
  });

  it('recusa valores absurdos — passa de leitura para lixo', () => {
    expect(validarKm(3_000_000, null)).toMatch(/demasiado alto/i);
  });

  it('RECUSA km inferior ao registado: o odómetro não anda para trás', () => {
    const erro = validarKm(90_000, 100_000);
    expect(erro).toBeTruthy();
    // A mensagem diz os dois números, senão o motorista não sabe o que corrigir.
    expect(erro).toContain('90');
    expect(erro).toContain('100');
  });

  it('aceita igual ao registado — pode ter estado parado', () => {
    expect(validarKm(100_000, 100_000)).toBeNull();
  });

  it('aceita superior', () => {
    expect(validarKm(100_500, 100_000)).toBeNull();
  });

  it('aceita quando a viatura ainda não tem km registado', () => {
    expect(validarKm(100_000, null)).toBeNull();
  });
});

describe('avisoSalto', () => {
  it('não avisa em saltos normais', () => {
    expect(avisoSalto(101_000, 100_000)).toBeNull();
  });

  it('avisa acima de 10 000 km, mas é só aviso — não bloqueia', () => {
    const aviso = avisoSalto(150_000, 100_000);
    expect(aviso).toBeTruthy();
    // Bloquear um salto grande deixava a viatura com o km velho, que é pior:
    // validarKm aceita-o.
    expect(validarKm(150_000, 100_000)).toBeNull();
  });

  it('não avisa quando não há termo de comparação', () => {
    expect(avisoSalto(100_000, null)).toBeNull();
  });
});
