import { describe, it, expect } from 'vitest';
import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';
import { arrumarFluxo, PASSO_X } from './arrumarFluxo';

function no(id: string, x = 999, y = 999): Node {
  return { id, type: 'accao', position: { x, y }, data: {} };
}
const liga = (de: string, para: string): Edge => ({
  id: `${de}-${para}`,
  source: de,
  target: para,
});

/**
 * "Arrumar" põe a corrente em linha, pela ordem das ligações — não pela ordem
 * do array nem pela posição onde os blocos calharam cair.
 */
describe('arrumarFluxo', () => {
  it('alinha a corrente pela ordem das ligações', () => {
    // Array deliberadamente fora de ordem: é o que acontece depois de apagar
    // e voltar a acrescentar blocos.
    const nodes = [no('c'), no('a'), no('b')];
    const edges = [liga('a', 'b'), liga('b', 'c')];

    const arrumados = arrumarFluxo(nodes, edges);
    const x = (id: string) => arrumados.find((n) => n.id === id)!.position.x;

    expect(x('a')).toBeLessThan(x('b'));
    expect(x('b')).toBeLessThan(x('c'));
  });

  it('põe tudo na mesma linha e com espaçamento igual', () => {
    const nodes = [no('a'), no('b'), no('c')];
    const arrumados = arrumarFluxo(nodes, [liga('a', 'b'), liga('b', 'c')]);

    expect(new Set(arrumados.map((n) => n.position.y)).size).toBe(1);
    const xs = arrumados.map((n) => n.position.x).sort((p, q) => p - q);
    expect(xs[1] - xs[0]).toBe(PASSO_X);
    expect(xs[2] - xs[1]).toBe(PASSO_X);
  });

  it('começa por quem não recebe ligação nenhuma', () => {
    // O gatilho é o único sem entrada; começar noutro sítio desenhava a
    // corrente ao contrário.
    const arrumados = arrumarFluxo([no('fim'), no('inicio')], [liga('inicio', 'fim')]);

    expect(arrumados.find((n) => n.id === 'inicio')!.position.x).toBe(0);
  });

  it('blocos soltos vão para o fim, sem se sobreporem', () => {
    // Largar um bloco e ainda não o ter ligado é normal a meio da edição.
    const arrumados = arrumarFluxo([no('a'), no('b'), no('solto')], [liga('a', 'b')]);
    const posicoes = arrumados.map((n) => `${n.position.x}:${n.position.y}`);

    expect(new Set(posicoes).size).toBe(3);
  });

  it('canvas vazio devolve lista vazia', () => {
    expect(arrumarFluxo([], [])).toEqual([]);
  });

  it('não perde nós nem lhes muda os dados', () => {
    const original = [no('a'), no('b')];
    const arrumados = arrumarFluxo(original, [liga('a', 'b')]);

    expect(arrumados).toHaveLength(2);
    expect(arrumados.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(arrumados[0].data).toBe(original.find((n) => n.id === arrumados[0].id)!.data);
  });

  it('um ciclo não faz o arrumar entrar em loop', () => {
    // O editor deixa ligar a->b e b->a; sem guarda, isto pendurava o browser.
    const arrumados = arrumarFluxo([no('a'), no('b')], [liga('a', 'b'), liga('b', 'a')]);

    expect(arrumados).toHaveLength(2);
  });
});
