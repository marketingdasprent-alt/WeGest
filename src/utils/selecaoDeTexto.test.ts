import { afterEach, describe, expect, it } from 'vitest';
import { haTextoSelecionado } from './selecaoDeTexto';

function selecionar(texto: string) {
  const p = document.createElement('p');
  p.textContent = texto;
  document.body.appendChild(p);
  const range = document.createRange();
  range.selectNodeContents(p);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

describe('haTextoSelecionado', () => {
  it('sem selecção, não há texto', () => {
    expect(haTextoSelecionado()).toBe(false);
  });

  it('com um nome selecionado, há texto', () => {
    selecionar('Dídimo Fernandes');
    expect(haTextoSelecionado()).toBe(true);
  });

  it('só espaços não conta como selecção', () => {
    selecionar('   ');
    expect(haTextoSelecionado()).toBe(false);
  });
});
