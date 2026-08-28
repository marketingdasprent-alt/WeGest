import { describe, it, expect } from 'vitest';
import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';
import { inserirEntre, inserirNaPonta } from './inserirPasso';

function no(id: string, x = 0): Node {
  return { id, type: 'accao', position: { x, y: 0 }, data: {} };
}

const NOVO = (): Node => ({ id: 'novo', type: 'condicao', position: { x: 0, y: 0 }, data: {} });

describe('inserirEntre', () => {
  const nodes = [no('a', 0), no('b', 400)];
  const edges: Edge[] = [{ id: 'a-b', source: 'a', target: 'b' }];

  it('religa as duas pontas através do passo novo', () => {
    const r = inserirEntre(nodes, edges, 'a-b', NOVO());

    expect(r.edges.map((e) => `${e.source}->${e.target}`).sort()).toEqual(['a->novo', 'novo->b']);
  });

  it('a ligação original desaparece — senão o fluxo tinha um atalho', () => {
    // Deixar a->b viva fazia o passo novo ser ignorável: havia dois caminhos.
    const r = inserirEntre(nodes, edges, 'a-b', NOVO());

    expect(r.edges.some((e) => e.id === 'a-b')).toBe(false);
  });

  it('põe o passo entre os dois, não por cima de nenhum', () => {
    const r = inserirEntre(nodes, edges, 'a-b', NOVO());
    const novo = r.nodes.find((n) => n.id === 'novo');

    expect(novo?.position.x).toBeGreaterThan(0);
    expect(novo?.position.x).toBeLessThan(400);
  });

  it('empurra para a direita tudo o que vem depois', () => {
    // Sem isto o passo novo ficava por cima do seguinte assim que a corrente
    // tivesse mais do que dois blocos.
    const tres = [no('a', 0), no('b', 400), no('c', 800)];
    const r = inserirEntre(tres, edges, 'a-b', NOVO());

    expect(r.nodes.find((n) => n.id === 'b')?.position.x).toBeGreaterThan(400);
    expect(r.nodes.find((n) => n.id === 'c')?.position.x).toBeGreaterThan(800);
  });

  it('aresta inexistente devolve o grafo intacto', () => {
    const r = inserirEntre(nodes, edges, 'nao-existe', NOVO());

    expect(r.nodes).toHaveLength(2);
    expect(r.edges).toEqual(edges);
  });
});

describe('inserirNaPonta', () => {
  it('liga o passo novo ao último da corrente', () => {
    const r = inserirNaPonta(
      [no('a', 0), no('b', 400)],
      [{ id: 'a-b', source: 'a', target: 'b' }],
      NOVO()
    );

    expect(r.edges.some((e) => e.source === 'b' && e.target === 'novo')).toBe(true);
    expect(r.nodes.find((n) => n.id === 'novo')?.position.x).toBeGreaterThan(400);
  });

  it('num canvas vazio acrescenta sem ligação nenhuma', () => {
    const r = inserirNaPonta([], [], NOVO());

    expect(r.nodes).toHaveLength(1);
    expect(r.edges).toEqual([]);
  });
});
