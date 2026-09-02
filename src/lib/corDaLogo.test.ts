import { describe, it, expect } from 'vitest';
import { corDominanteDePixeis } from './corDaLogo';

/** Constrói um bloco RGBA a partir de uma lista de [r,g,b,a] repetidos n vezes. */
function pixeis(...blocos: Array<{ cor: [number, number, number, number]; n: number }>) {
  const total = blocos.reduce((s, b) => s + b.n, 0);
  const dados = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const { cor, n } of blocos) {
    for (let k = 0; k < n; k++) {
      dados[i++] = cor[0];
      dados[i++] = cor[1];
      dados[i++] = cor[2];
      dados[i++] = cor[3];
    }
  }
  return dados;
}

const BRANCO: [number, number, number, number] = [255, 255, 255, 255];
const PRETO: [number, number, number, number] = [0, 0, 0, 255];
const TRANSPARENTE: [number, number, number, number] = [200, 30, 40, 0];
const AZUL: [number, number, number, number] = [27, 58, 107, 255];

describe('corDominanteDePixeis', () => {
  it('encontra a cor de um logótipo simples', () => {
    expect(corDominanteDePixeis(pixeis({ cor: AZUL, n: 50 }))).toBe('#1B3A6B');
  });

  it('ignora o fundo transparente, que é a maioria de um logótipo PNG', () => {
    const dados = pixeis({ cor: TRANSPARENTE, n: 900 }, { cor: AZUL, n: 100 });
    expect(corDominanteDePixeis(dados)).toBe('#1B3A6B');
  });

  it('ignora branco e preto — são fundo e contorno, não a marca', () => {
    const dados = pixeis({ cor: BRANCO, n: 600 }, { cor: PRETO, n: 300 }, { cor: AZUL, n: 100 });
    expect(corDominanteDePixeis(dados)).toBe('#1B3A6B');
  });

  it('prefere a cor viva à lavada, mesmo com menos área', () => {
    // Bege lavado em muita área contra vermelho vivo em pouca: ganha o vivo,
    // que é o que uma pessoa identifica como "a cor daquele logótipo".
    const bege: [number, number, number, number] = [214, 202, 186, 255];
    const vermelho: [number, number, number, number] = [200, 16, 24, 255];
    const dados = pixeis({ cor: bege, n: 700 }, { cor: vermelho, n: 120 });
    expect(corDominanteDePixeis(dados)).toBe('#C81018');
  });

  it('agrupa tons vizinhos e devolve a média deles', () => {
    // Dois azuis quase iguais (anti-aliasing) contam como a mesma cor.
    const dados = pixeis({ cor: [27, 58, 107, 255], n: 50 }, { cor: [29, 60, 109, 255], n: 50 });
    expect(corDominanteDePixeis(dados)).toBe('#1C3B6C');
  });

  it('devolve null num logótipo a preto e branco', () => {
    // Sem cor não se inventa uma: quem chama fica com a marca WeGest.
    const dados = pixeis({ cor: BRANCO, n: 500 }, { cor: PRETO, n: 500 });
    expect(corDominanteDePixeis(dados)).toBeNull();
  });

  it('devolve null sem pixéis nenhuns', () => {
    expect(corDominanteDePixeis(new Uint8ClampedArray(0))).toBeNull();
  });
});
