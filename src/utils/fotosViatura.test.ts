import { describe, it, expect } from 'vitest';
import {
  MAX_FOTOS_VIATURA,
  caminhosFoto,
  dimensoesReduzidas,
  eImagem,
  mover,
  moverParaInicio,
  quantasCabem,
} from './fotosViatura';

describe('quantasCabem', () => {
  it('o máximo é 8 por viatura', () => {
    expect(MAX_FOTOS_VIATURA).toBe(8);
  });

  it('aceita tudo quando há vagas', () => {
    expect(quantasCabem(2, ['a', 'b', 'c'])).toEqual({ aceites: ['a', 'b', 'c'], ignoradas: 0 });
  });

  it('corta no limite e diz quantas ficaram de fora', () => {
    expect(quantasCabem(6, ['a', 'b', 'c', 'd'])).toEqual({ aceites: ['a', 'b'], ignoradas: 2 });
  });

  it('cheia: não aceita nada', () => {
    expect(quantasCabem(8, ['a'])).toEqual({ aceites: [], ignoradas: 1 });
  });

  it('dados antigos acima do limite não dão vagas negativas', () => {
    expect(quantasCabem(10, ['a'])).toEqual({ aceites: [], ignoradas: 1 });
  });
});

describe('mover', () => {
  it('move para a frente e para trás', () => {
    expect(mover(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(mover(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('não altera o original', () => {
    const original = ['a', 'b'];
    mover(original, 0, 1);
    expect(original).toEqual(['a', 'b']);
  });

  it('índices fora da lista devolvem cópia igual', () => {
    expect(mover(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});

describe('moverParaInicio (definir capa)', () => {
  it('põe a foto escolhida à frente e mantém a ordem das outras', () => {
    expect(moverParaInicio(['a', 'b', 'c', 'd'], 'c')).toEqual(['c', 'a', 'b', 'd']);
  });

  it('já é a capa: fica igual', () => {
    expect(moverParaInicio(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it('id desconhecido: fica igual', () => {
    expect(moverParaInicio(['a', 'b'], 'x')).toEqual(['a', 'b']);
  });
});

describe('dimensoesReduzidas', () => {
  it('reduz pelo lado maior, mantendo a proporção', () => {
    expect(dimensoesReduzidas(4000, 3000, 1920)).toEqual({ largura: 1920, altura: 1440 });
    expect(dimensoesReduzidas(3000, 4000, 480)).toEqual({ largura: 360, altura: 480 });
  });

  it('nunca amplia uma foto pequena', () => {
    expect(dimensoesReduzidas(800, 600, 1920)).toEqual({ largura: 800, altura: 600 });
  });

  it('aguenta dimensões a zero', () => {
    expect(dimensoesReduzidas(0, 0, 480)).toEqual({ largura: 0, altura: 0 });
  });
});

describe('caminhosFoto', () => {
  it('foto e miniatura na pasta da viatura, com o mesmo carimbo', () => {
    expect(caminhosFoto('v-1', '123_ab')).toEqual({
      foto: 'v-1/fotos/123_ab.jpg',
      miniatura: 'v-1/fotos/123_ab_mini.jpg',
    });
  });
});

describe('eImagem', () => {
  it('só aceita imagens', () => {
    expect(eImagem({ type: 'image/jpeg' })).toBe(true);
    expect(eImagem({ type: 'image/heic' })).toBe(true);
    expect(eImagem({ type: 'application/pdf' })).toBe(false);
    expect(eImagem({ type: '' })).toBe(false);
  });
});
