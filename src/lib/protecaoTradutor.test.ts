import { beforeAll, describe, expect, it } from 'vitest';

import { protegerContraTradutor } from './protecaoTradutor';

describe('protegerContraTradutor', () => {
  beforeAll(() => protegerContraTradutor());

  it('remover um nó que o tradutor já tirou não rebenta', () => {
    const pai = document.createElement('div');
    const texto = document.createTextNode('Olá');
    pai.appendChild(texto);
    // O tradutor substitui o texto por um <font> dele.
    const font = document.createElement('font');
    font.textContent = 'Hello';
    pai.replaceChild(font, texto);

    expect(() => pai.removeChild(texto)).not.toThrow();
    expect(pai.textContent).toBe('Hello');
  });

  it('inserir antes de um nó que já não está no pai acrescenta no fim', () => {
    const pai = document.createElement('div');
    const fora = document.createElement('span');
    const novo = document.createElement('b');

    expect(() => pai.insertBefore(novo, fora)).not.toThrow();
    expect(pai.lastChild).toBe(novo);
  });

  it('o comportamento normal mantém-se', () => {
    const pai = document.createElement('div');
    const a = document.createElement('i');
    const b = document.createElement('u');
    pai.appendChild(a);
    pai.insertBefore(b, a);
    expect(pai.firstChild).toBe(b);
    pai.removeChild(a);
    expect(pai.childNodes.length).toBe(1);
  });

  it('chamar duas vezes não volta a embrulhar', () => {
    const antes = Node.prototype.removeChild;
    protegerContraTradutor();
    expect(Node.prototype.removeChild).toBe(antes);
  });
});
