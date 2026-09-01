import { describe, it, expect } from 'vitest';
import type { AutomationNode as Node, AutomationEdge as Edge } from './dominio/tipos';
import { validarLigacao } from './validarLigacao';

function no(id: string, type: string): Node {
  return { id, type, position: { x: 0, y: 0 }, data: {} };
}

describe('validarLigacao', () => {
  it('recusa uma acção como origem — não pode ligar a outra coisa', () => {
    const nodes = [no('t', 'trigger'), no('a1', 'accao'), no('a2', 'accao')];
    const resultado = validarLigacao({ source: 'a1', target: 'a2' }, nodes, []);

    expect(resultado).not.toBe(true);
    expect(typeof resultado).toBe('string');
  });

  it('recusa um alvo que já tem uma ligação a entrar', () => {
    const nodes = [no('t', 'trigger'), no('a1', 'accao'), no('a2', 'accao')];
    const edges: Edge[] = [{ id: 'e1', source: 't', target: 'a1' }];

    const resultado = validarLigacao({ source: 't', target: 'a1' }, nodes, edges);

    expect(resultado).not.toBe(true);
  });

  it('aceita o gatilho a ligar a uma segunda acção', () => {
    const nodes = [no('t', 'trigger'), no('a1', 'accao'), no('a2', 'accao')];
    const edges: Edge[] = [{ id: 'e1', source: 't', target: 'a1' }];

    expect(validarLigacao({ source: 't', target: 'a2' }, nodes, edges)).toBe(true);
  });

  it('aceita o gatilho a ligar a uma condição', () => {
    const nodes = [no('t', 'trigger'), no('c1', 'condicao')];
    expect(validarLigacao({ source: 't', target: 'c1' }, nodes, [])).toBe(true);
  });

  it('aceita uma condição a ligar a uma acção', () => {
    const nodes = [no('c1', 'condicao'), no('a1', 'accao')];
    expect(validarLigacao({ source: 'c1', target: 'a1' }, nodes, [])).toBe(true);
  });
});
