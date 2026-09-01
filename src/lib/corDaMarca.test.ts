import { describe, it, expect } from 'vitest';
import {
  paletaDaMarca,
  textoLegivelSobre,
  comTransparencia,
  paraTokenHsl,
  COR_PADRAO,
} from './corDaMarca';

describe('textoLegivelSobre', () => {
  it('põe texto preto sobre cores claras', () => {
    expect(textoLegivelSobre('#FFD400')).toBe('#000000'); // amarelo
    expect(textoLegivelSobre('#FFFFFF')).toBe('#000000');
    expect(textoLegivelSobre('#7FE3B0')).toBe('#000000'); // verde claro
  });

  it('põe texto branco sobre cores escuras', () => {
    expect(textoLegivelSobre('#0E6B6B')).toBe('#FFFFFF'); // teal da aplicação
    expect(textoLegivelSobre('#000000')).toBe('#FFFFFF');
    expect(textoLegivelSobre('#7B1E1E')).toBe('#FFFFFF'); // bordô
  });

  it('decide pela percepção, não pela soma dos canais', () => {
    // Os dois têm a mesma soma de canais (255), mas o verde é muito mais
    // luminoso ao olho: um pede texto preto, o outro branco.
    expect(textoLegivelSobre('#00FF00')).toBe('#000000');
    expect(textoLegivelSobre('#0000FF')).toBe('#FFFFFF');
  });
});

describe('paletaDaMarca', () => {
  it('usa a cor da organização quando está definida', () => {
    const p = paletaDaMarca('#FFD400');
    expect(p.cor).toBe('#FFD400');
    expect(p.corDoTexto).toBe('#000000');
    expect(p.daOrganizacao).toBe(true);
  });

  it('normaliza para maiúsculas e aceita espaços à volta', () => {
    expect(paletaDaMarca('  #ffd400  ').cor).toBe('#FFD400');
  });

  it('cai na cor da aplicação sem cor definida', () => {
    for (const vazio of [null, undefined, '']) {
      const p = paletaDaMarca(vazio);
      expect(p.cor).toBe(COR_PADRAO);
      expect(p.daOrganizacao).toBe(false);
    }
  });

  it('ignora valores que não são hexadecimais, sem rebentar', () => {
    // A base de dados tem CHECK, mas o ecrã é público: nunca pode ficar sem
    // cor por causa de um valor estranho.
    for (const lixo of ['azul', 'rgb(0,0,0)', '#FFF', '#GGGGGG', '#0E6B6B00']) {
      const p = paletaDaMarca(lixo);
      expect(p.cor).toBe(COR_PADRAO);
      expect(p.daOrganizacao).toBe(false);
    }
  });

  it('deriva o suave e o contorno da mesma cor', () => {
    const p = paletaDaMarca('#0E6B6B');
    expect(p.corSuave).toBe('rgba(14, 107, 107, 0.12)');
    expect(p.corDeContorno).toBe('rgba(14, 107, 107, 0.3)');
  });
});

describe('paraTokenHsl', () => {
  it('converte para o formato dos tokens da aplicação', () => {
    // Verde e azul iguais → matiz exactamente 180 (ciano).
    expect(paraTokenHsl('#0E6B6B')).toBe('180 77% 24%');
    expect(paraTokenHsl('#FFFFFF')).toBe('0 0% 100%');
    expect(paraTokenHsl('#000000')).toBe('0 0% 0%');
  });

  it('acerta a matiz em cada um dos três sectores', () => {
    expect(paraTokenHsl('#FF0000')).toBe('0 100% 50%');
    expect(paraTokenHsl('#00FF00')).toBe('120 100% 50%');
    expect(paraTokenHsl('#0000FF')).toBe('240 100% 50%');
  });

  it('a paleta traz as variáveis prontas para o contentor da página', () => {
    const p = paletaDaMarca('#FFD400');
    expect(p.variaveisCss).toMatchObject({
      '--primary': paraTokenHsl('#FFD400'),
      // Amarelo pede texto preto — e o token tem de acompanhar, senão o
      // indicador de etapas fica com número branco sobre fundo amarelo.
      '--primary-foreground': '0 0% 0%',
    });
  });
});

describe('comTransparencia', () => {
  it('converte hexadecimal para rgba', () => {
    expect(comTransparencia('#FFFFFF', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(comTransparencia('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
  });
});
