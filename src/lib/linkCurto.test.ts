import { describe, it, expect } from 'vitest';
import { gerarCodigoLinkCurto, urlLinkCurto, ALFABETO_CODIGO } from './linkCurto';

describe('gerarCodigoLinkCurto', () => {
  it('tem 12 caracteres — o código É a credencial de quem abre o ficheiro', () => {
    // 12 × log2(50) ≈ 67 bits. Menos do que isto e adivinhar códigos deixa de
    // ser absurdo, porque a função que os resolve é pública.
    expect(gerarCodigoLinkCurto()).toHaveLength(12);
  });

  it('não usa caracteres que se confundem uns com os outros', () => {
    // O link é lido em voz alta e escrito à mão mais vezes do que se pensa.
    expect(ALFABETO_CODIGO).not.toMatch(/[0O1lI]/);
  });

  it('só usa letras e dígitos, como o check da tabela exige', () => {
    for (let i = 0; i < 200; i++) {
      expect(gerarCodigoLinkCurto()).toMatch(/^[A-Za-z0-9]{12}$/);
    }
  });

  it('não repete', () => {
    const vistos = new Set(Array.from({ length: 500 }, () => gerarCodigoLinkCurto()));
    expect(vistos.size).toBe(500);
  });
});

describe('urlLinkCurto', () => {
  it('é curto, que é a razão de tudo isto existir', () => {
    const url = urlLinkCurto('ABCDEFGHJKMN');
    expect(url).toBe('https://wegest.pt/r/ABCDEFGHJKMN');
    expect(url.length).toBeLessThan(40);
  });
});
