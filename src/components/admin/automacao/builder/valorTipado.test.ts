import { describe, expect, it } from 'vitest';
import { paraTexto, paraValorJson, tipoDoCampo } from './valorTipado';

/**
 * O que estes testes protegem é um bug concreto, não uma abstracção.
 *
 * Até aqui o editor gravava TUDO como string. O avaliador de condições compara
 * por tipo e não faz coerção, portanto uma condição sobre um campo numérico
 * escrita como `"500"` nunca casava com um payload que traz `500` — e sem erro
 * nenhum: a automação simplesmente não disparava.
 */

describe('paraValorJson', () => {
  it('deixa o texto como texto', () => {
    expect(paraValorJson('aberto', 'string')).toBe('aberto');
    // Um número escrito num campo de texto continua texto: o tipo vem do
    // catálogo, não da aparência do que o utilizador escreveu.
    expect(paraValorJson('500', 'string')).toBe('500');
  });

  it('converte números para number, não para string', () => {
    expect(paraValorJson('500', 'number')).toBe(500);
    expect(paraValorJson('0', 'number')).toBe(0);
    expect(paraValorJson('-1', 'number')).toBe(-1);
    expect(paraValorJson('1.5', 'number')).toBe(1.5);
  });

  it('recusa um número vazio em vez de o tratar como zero', () => {
    // `Number('')` é 0. Sem o guarda, um campo por preencher gravava uma
    // condição «igual a zero» que o utilizador nunca escreveu.
    expect(paraValorJson('', 'number')).toBeNull();
    expect(paraValorJson('   ', 'number')).toBeNull();
  });

  it('recusa texto que não é número', () => {
    expect(paraValorJson('banana', 'number')).toBeNull();
  });

  it('converte booleanos para boolean, não para a string "true"', () => {
    expect(paraValorJson('true', 'boolean')).toBe(true);
    expect(paraValorJson('false', 'boolean')).toBe(false);
  });

  it('recusa qualquer outra coisa num campo boolean', () => {
    // O motor distingue `false` de `"false"`. Aceitar «sim» aqui produzia uma
    // condição que nunca casa.
    expect(paraValorJson('sim', 'boolean')).toBeNull();
    expect(paraValorJson('', 'boolean')).toBeNull();
  });
});

describe('paraTexto', () => {
  it('devolve o valor gravado ao formulário sem o alterar', () => {
    expect(paraTexto('aberto')).toBe('aberto');
    expect(paraTexto(500)).toBe('500');
    expect(paraTexto(true)).toBe('true');
    expect(paraTexto(false)).toBe('false');
  });

  it('trata a ausência como campo vazio, não como "null"', () => {
    expect(paraTexto(null)).toBe('');
    expect(paraTexto(undefined)).toBe('');
  });
});

describe('tipoDoCampo', () => {
  const campos = [
    { id: 'prioridade', tipo: 'string' as const },
    { id: 'valor_total', tipo: 'number' as const },
  ];

  it('lê o tipo declarado no catálogo', () => {
    expect(tipoDoCampo(campos, 'valor_total')).toBe('number');
    expect(tipoDoCampo(campos, 'prioridade')).toBe('string');
  });

  it('assume string quando o campo é desconhecido', () => {
    // É o que o motor faz com texto. Assumir `number` produziria uma condição
    // que nunca casa.
    expect(tipoDoCampo(campos, 'inventado')).toBe('string');
    expect(tipoDoCampo(campos, undefined)).toBe('string');
  });
});
