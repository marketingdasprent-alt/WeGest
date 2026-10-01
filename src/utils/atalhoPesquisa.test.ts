import { describe, it, expect } from 'vitest';

import { deveFocarPesquisa } from './atalhoPesquisa';

const el = (tag: string, editavel = false) => {
  const e = document.createElement(tag);
  if (editavel) e.contentEditable = 'true';
  Object.defineProperty(e, 'isContentEditable', { value: editavel });
  return e;
};

describe('deveFocarPesquisa', () => {
  it('"/" na página leva à pesquisa', () => {
    expect(deveFocarPesquisa({ key: '/', target: document.body })).toBe(true);
    expect(deveFocarPesquisa({ key: '/', target: el('button') })).toBe(true);
  });

  it('não rouba o "/" a quem escreve noutro campo', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(deveFocarPesquisa({ key: '/', target: el(tag) })).toBe(false);
    }
    expect(deveFocarPesquisa({ key: '/', target: el('div', true) })).toBe(false);
  });

  it('outras teclas e combinações com Ctrl/Cmd/Alt não contam', () => {
    expect(deveFocarPesquisa({ key: 'a', target: document.body })).toBe(false);
    expect(deveFocarPesquisa({ key: '/', ctrlKey: true, target: document.body })).toBe(false);
    expect(deveFocarPesquisa({ key: '/', metaKey: true, target: document.body })).toBe(false);
  });
});
