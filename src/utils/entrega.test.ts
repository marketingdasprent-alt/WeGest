import { describe, it, expect } from 'vitest';
import {
  tipoLabel,
  cacheKey,
  LOCALIZACOES,
  LOCALIZACAO_LABEL,
  validarDadosObrigatorios,
  validarKmContraViatura,
} from './entrega';

describe('tipoLabel', () => {
  it('devolve "Entrega" para tipo entrega', () => {
    expect(tipoLabel('entrega')).toBe('Entrega');
  });

  it('devolve "Recolha" para tipo recolha', () => {
    expect(tipoLabel('recolha')).toBe('Recolha');
  });

  it('devolve "Troca" para tipo troca', () => {
    expect(tipoLabel('troca')).toBe('Troca');
  });

  it('devolve "Recolha" para undefined', () => {
    expect(tipoLabel(undefined)).toBe('Recolha');
  });
});

describe('cacheKey', () => {
  it('cria chave com o token', () => {
    expect(cacheKey('abc-123')).toBe('realizar-rascunho-abc-123');
  });
});

describe('LOCALIZACOES', () => {
  it('tem 8 localizações', () => {
    expect(LOCALIZACOES).toHaveLength(8);
  });

  it('mapeia labels correctamente', () => {
    expect(LOCALIZACAO_LABEL['frente']).toBe('Frente');
    expect(LOCALIZACAO_LABEL['traseira']).toBe('Traseira');
    expect(LOCALIZACAO_LABEL['lateral_esq']).toBe('Lateral Esquerda');
  });
});

describe('validarDadosObrigatorios', () => {
  it('retorna null quando tudo preenchido', () => {
    expect(validarDadosObrigatorios('45000', '1/2', false)).toBeNull();
  });

  it('retorna mensagem se km vazio', () => {
    const msg = validarDadosObrigatorios('', '1/2', false);
    expect(msg).toContain('Preenche o km');
  });

  it('retorna mensagem se combustivel vazio', () => {
    const msg = validarDadosObrigatorios('45000', '', false);
    expect(msg).toContain('Preenche o km');
  });

  it('retorna mensagem se troca e kmAntiga vazio', () => {
    const msg = validarDadosObrigatorios('45000', '1/2', true, '', '1/4');
    expect(msg).toContain('viatura devolvida');
  });

  it('retorna null se troca e ambos preenchidos', () => {
    const msg = validarDadosObrigatorios('45000', '1/2', true, '44000', '3/4');
    expect(msg).toBeNull();
  });

  it('bloqueia km inferior ao km atual da viatura (regressão: 35 num carro com 350000)', () => {
    const msg = validarDadosObrigatorios(
      '35',
      '1/2',
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      350000
    );
    expect(msg).toContain('não pode ser inferior');
  });

  it('aceita km igual ou superior ao km atual da viatura', () => {
    const args = ['350000', '1/2', false] as const;
    const extra = [undefined, undefined, undefined, undefined, undefined, undefined] as const;
    expect(validarDadosObrigatorios(...args, ...extra, 350000)).toBeNull();
    expect(validarDadosObrigatorios(...args, ...extra, 349999)).toBeNull();
  });

  it('na troca também bloqueia o km da viatura devolvida', () => {
    const msg = validarDadosObrigatorios(
      '400000',
      '1/2',
      true,
      '10',
      '3/4',
      undefined,
      undefined,
      undefined,
      undefined,
      100000, // ok para a nova
      200000 // devolvida: 10 < 200000 → bloqueia
    );
    expect(msg).toContain('não pode ser inferior');
  });
});

describe('validarKmContraViatura', () => {
  it('null quando não há baseline (km da viatura desconhecido)', () => {
    expect(validarKmContraViatura('35', null)).toBeNull();
    expect(validarKmContraViatura('35', undefined)).toBeNull();
  });
  it('null quando km >= baseline', () => {
    expect(validarKmContraViatura('350000', 350000)).toBeNull();
    expect(validarKmContraViatura('351000', 350000)).toBeNull();
  });
  it('mensagem quando km < baseline', () => {
    expect(validarKmContraViatura('35', 350000)).toContain('não pode ser inferior');
  });
  it('não bloqueia quando km não é número (a obrigatoriedade é validada antes)', () => {
    expect(validarKmContraViatura('', 350000)).toBeNull();
    expect(validarKmContraViatura('abc', 350000)).toBeNull();
  });
});
