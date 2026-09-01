import { describe, it, expect } from 'vitest';
import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';
import { templatePorChave } from './catalogo';
import { inserirEntre, inserirSolto } from './inserirPasso';

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

describe('inserirSolto', () => {
  it('cria o nó sem nenhuma aresta', () => {
    const gatilho: Node = { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: {} };
    const template = templatePorChave('notificacao')!;

    const resultado = inserirSolto([gatilho], { x: 400, y: 200 }, template, 1);

    expect(resultado.nodes).toHaveLength(2);
    expect(resultado.nodes[1].position).toEqual({ x: 400, y: 200 });
  });
});
