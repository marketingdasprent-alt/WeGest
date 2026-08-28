import { describe, it, expect } from 'vitest';
import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';
import { assinaturaDoFluxo } from './assinaturaDoFluxo';

/**
 * O badge "Alterações por guardar" só vale se disser a verdade. Isto é o que
 * decide quando ele acende — e sobretudo quando NÃO deve acender.
 */
function no(id: string, data: Record<string, unknown>, x = 0): Node {
  return { id, type: 'accao', position: { x, y: 0 }, data };
}

describe('assinaturaDoFluxo', () => {
  it('o mesmo fluxo dá sempre a mesma assinatura', () => {
    const a = assinaturaDoFluxo([no('a', { cargoIds: ['c1'] })], []);
    const b = assinaturaDoFluxo([no('a', { cargoIds: ['c1'] })], []);

    expect(a).toBe(b);
  });

  it('mudar um campo muda a assinatura', () => {
    const antes = assinaturaDoFluxo([no('a', { cargoIds: ['c1'] })], []);
    const depois = assinaturaDoFluxo([no('a', { cargoIds: ['c1', 'c2'] })], []);

    expect(depois).not.toBe(antes);
  });

  it('arrastar um nó NÃO conta como alteração por guardar', () => {
    // A posição não é gravada em lado nenhum. Se contasse, o badge acendia ao
    // primeiro arrasto e pedia para guardar uma coisa que não muda nada.
    const antes = assinaturaDoFluxo([no('a', { cargoIds: [] }, 0)], []);
    const depois = assinaturaDoFluxo([no('a', { cargoIds: [] }, 900)], []);

    expect(depois).toBe(antes);
  });

  it('acrescentar ou remover um passo muda a assinatura', () => {
    const um = assinaturaDoFluxo([no('a', {})], []);
    const dois = assinaturaDoFluxo([no('a', {}), no('b', {})], []);

    expect(dois).not.toBe(um);
  });

  it('ligar dois passos muda a assinatura', () => {
    const nos = [no('a', {}), no('b', {})];
    const ligado: Edge[] = [{ id: 'e', source: 'a', target: 'b' }];

    expect(assinaturaDoFluxo(nos, ligado)).not.toBe(assinaturaDoFluxo(nos, []));
  });

  it('a ordem em que os nós estão no array não conta', () => {
    // Apagar e voltar a acrescentar um bloco reordena o array sem mudar nada
    // do que vai para a base de dados.
    const ab = assinaturaDoFluxo([no('a', {}), no('b', {})], []);
    const ba = assinaturaDoFluxo([no('b', {}), no('a', {})], []);

    expect(ba).toBe(ab);
  });

  it('canvas vazio tem assinatura própria, não vazia', () => {
    expect(assinaturaDoFluxo([], [])).toBeTruthy();
  });
});
