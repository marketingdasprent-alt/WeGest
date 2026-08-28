import { describe, it, expect } from 'vitest';
import {
  criarPilha,
  desfazer,
  LIMITE_DE_EDICOES,
  podeDesfazer,
  podeRefazer,
  refazer,
  registar,
} from './pilhaDeEdicoes';

/**
 * Desfazer/refazer do editor. É pura de propósito: a parte que costuma correr
 * mal — perder o futuro, crescer sem limite, gravar estados iguais — não tem
 * nada que ver com React e testa-se sem montar nada.
 */
describe('pilhaDeEdicoes', () => {
  it('começa sem nada para desfazer nem refazer', () => {
    const p = criarPilha('a');

    expect(p.presente).toBe('a');
    expect(podeDesfazer(p)).toBe(false);
    expect(podeRefazer(p)).toBe(false);
  });

  it('registar guarda o anterior e permite desfazer', () => {
    const p = registar(criarPilha('a'), 'b');

    expect(p.presente).toBe('b');
    expect(podeDesfazer(p)).toBe(true);
    expect(desfazer(p).presente).toBe('a');
  });

  it('desfazer e refazer voltam ao mesmo sítio', () => {
    const p = registar(registar(criarPilha('a'), 'b'), 'c');
    const atras = desfazer(desfazer(p));

    expect(atras.presente).toBe('a');
    expect(refazer(refazer(atras)).presente).toBe('c');
  });

  it('registar algo novo depois de desfazer apaga o futuro', () => {
    // É o comportamento de qualquer editor: a partir do momento em que se
    // escreve por cima, o que estava à frente deixa de existir.
    const p = registar(desfazer(registar(criarPilha('a'), 'b')), 'c');

    expect(p.presente).toBe('c');
    expect(podeRefazer(p)).toBe(false);
    expect(desfazer(p).presente).toBe('a');
  });

  it('registar o mesmo estado não cria um passo', () => {
    // Sem isto, cada render que devolvesse a mesma assinatura enchia a pilha
    // e era preciso carregar dez vezes em desfazer para ver uma alteração.
    const p = registar(registar(criarPilha('a'), 'b'), 'b');

    expect(desfazer(p).presente).toBe('a');
  });

  it('desfazer no início e refazer no fim não rebentam', () => {
    const p = criarPilha('a');

    expect(desfazer(p).presente).toBe('a');
    expect(refazer(p).presente).toBe('a');
  });

  it('a pilha não cresce sem limite', () => {
    // Uma sessão longa de edição não pode ficar a segurar centenas de cópias
    // do grafo em memória.
    let p = criarPilha('0');
    for (let i = 1; i <= LIMITE_DE_EDICOES + 20; i++) p = registar(p, String(i));

    expect(p.passado).toHaveLength(LIMITE_DE_EDICOES);
    // O mais antigo já saiu: desfazer tudo não volta ao '0'.
    let atras = p;
    while (podeDesfazer(atras)) atras = desfazer(atras);
    expect(atras.presente).not.toBe('0');
  });
});
