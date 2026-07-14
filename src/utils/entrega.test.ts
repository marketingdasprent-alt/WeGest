import { describe, it, expect } from 'vitest';
import {
  tipoLabel,
  cacheKey,
  LOCALIZACOES,
  LOCALIZACAO_LABEL,
  validarDadosObrigatorios,
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
});
