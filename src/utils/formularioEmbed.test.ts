import { describe, expect, it } from 'vitest';
import {
  alturaDaMensagem,
  codigoDeIncorporacao,
  mensagemDeAltura,
  modoEmbedAtivo,
  TIPO_MENSAGEM_ALTURA,
  urlDeIncorporacao,
} from './formularioEmbed';

describe('modoEmbedAtivo', () => {
  it('liga com embed=1 ou embed=true, em string ou URLSearchParams', () => {
    expect(modoEmbedAtivo('?embed=1')).toBe(true);
    expect(modoEmbedAtivo('embed=TRUE')).toBe(true);
    expect(modoEmbedAtivo(new URLSearchParams('embed=1&x=2'))).toBe(true);
  });

  it('fica desligado sem o parâmetro ou com outro valor', () => {
    expect(modoEmbedAtivo('')).toBe(false);
    expect(modoEmbedAtivo('?embed=0')).toBe(false);
    expect(modoEmbedAtivo('?embed=sim')).toBe(false);
    expect(modoEmbedAtivo('?outra=1')).toBe(false);
  });
});

describe('mensagem de altura', () => {
  it('arredonda para cima e identifica-se', () => {
    expect(mensagemDeAltura(612.3)).toEqual({ tipo: TIPO_MENSAGEM_ALTURA, altura: 613 });
  });

  it('só lê mensagens nossas com altura válida', () => {
    expect(alturaDaMensagem(mensagemDeAltura(500))).toBe(500);
    expect(alturaDaMensagem({ tipo: TIPO_MENSAGEM_ALTURA, altura: 0 })).toBeNull();
    expect(alturaDaMensagem({ tipo: 'outra', altura: 500 })).toBeNull();
    expect(alturaDaMensagem('texto')).toBeNull();
    expect(alturaDaMensagem(null)).toBeNull();
  });
});

describe('código de incorporação', () => {
  const id = '4588f264-ce79-40fa-9827-b985af4ee68e';

  it('monta o url com embed=1, sem barra a dobrar', () => {
    expect(urlDeIncorporacao('https://www.wegest.pt/', id)).toBe(
      `https://www.wegest.pt/formulario/${id}?embed=1`
    );
  });

  it('o snippet tem o iframe, filtra a origem e usa o mesmo tipo de mensagem', () => {
    const codigo = codigoDeIncorporacao('https://www.wegest.pt', id);
    expect(codigo).toContain(`src="https://www.wegest.pt/formulario/${id}?embed=1"`);
    expect(codigo).toContain("evento.origin !== 'https://www.wegest.pt'");
    expect(codigo).toContain(TIPO_MENSAGEM_ALTURA);
    expect(codigo).toContain("getElementById('wegest-formulario')");
  });
});
