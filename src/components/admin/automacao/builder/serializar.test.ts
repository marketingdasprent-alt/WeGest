import { describe, it, expect } from 'vitest';
import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';
import { serializarFluxo } from './serializar';

/**
 * O payload é o contrato com o backend que ainda não existe. Testá-lo agora é
 * o que impede que a forma mude por acidente quando o backend chegar.
 */

function no(id: string, type: 'trigger' | 'accao', data: Record<string, unknown> = {}): Node {
  return {
    id,
    type,
    position: { x: 100, y: 200 },
    data,
    // Lixo que o React Flow acrescenta em runtime e que não é lógica nenhuma.
    selected: true,
    dragging: false,
    measured: { width: 224, height: 90 },
  } as Node;
}

describe('serializarFluxo', () => {
  it('canvas vazio dá um payload válido, não undefined', () => {
    const payload = serializarFluxo([], []);

    expect(payload).toMatchObject({ versao: 1, nos: [], ligacoes: [] });
  });

  it('tira a posição de dentro do nó e guarda-a à parte', () => {
    // A posição não é lógica, mas atirá-la fora impedia redesenhar o fluxo
    // como o utilizador o deixou. Sai do nó, fica no layout.
    const payload = serializarFluxo([no('t1', 'trigger', { modulo: 'viaturas' })], []);

    expect(payload.nos[0]).not.toHaveProperty('position');
    expect(payload.layout.t1).toEqual({ x: 100, y: 200 });
  });

  it('não deixa passar estado visual do React Flow', () => {
    // Lista fechada em vez de verificar campo a campo: assim, se o React Flow
    // acrescentar `handles` ou `internals` numa versão futura, este teste
    // falha em vez de os deixar entrar no payload em silêncio.
    const payload = serializarFluxo([no('t1', 'trigger', { modulo: 'viaturas' })], []);

    expect(Object.keys(payload.nos[0]).sort()).toEqual(['config', 'id', 'tipo']);
  });

  it('mantém o id e a configuração do nó — é o que o backend vai ler', () => {
    const payload = serializarFluxo(
      [
        no('a1', 'accao', {
          accao: 'notificacao',
          cargoIds: ['c1', 'c2'],
          enviarEmail: true,
          cooldownMinutos: 1440,
        }),
      ],
      []
    );

    expect(payload.nos[0]).toMatchObject({
      id: 'a1',
      tipo: 'accao',
      config: {
        accao: 'notificacao',
        cargoIds: ['c1', 'c2'],
        enviarEmail: true,
        cooldownMinutos: 1440,
      },
    });
  });

  it('as ligações viram pares de/para', () => {
    const edges: Edge[] = [{ id: 'e1', source: 't1', target: 'a1' }];
    const payload = serializarFluxo([no('t1', 'trigger'), no('a1', 'accao')], edges);

    expect(payload.ligacoes).toEqual([{ de: 't1', para: 'a1' }]);
  });

  it('descarta ligações que apontam para nós que já não existem', () => {
    // Apagar um nó com Delete deixa as arestas órfãs por um instante; um
    // payload com elas fazia o backend rejeitar o fluxo inteiro.
    const edges: Edge[] = [
      { id: 'e1', source: 't1', target: 'a1' },
      { id: 'e2', source: 't1', target: 'apagado' },
    ];
    const payload = serializarFluxo([no('t1', 'trigger'), no('a1', 'accao')], edges);

    expect(payload.ligacoes).toEqual([{ de: 't1', para: 'a1' }]);
  });

  it('nó sem tipo não rebenta a serialização', () => {
    const semTipo = { id: 'x', position: { x: 0, y: 0 }, data: {} } as Node;

    expect(() => serializarFluxo([semTipo], [])).not.toThrow();
  });
});
