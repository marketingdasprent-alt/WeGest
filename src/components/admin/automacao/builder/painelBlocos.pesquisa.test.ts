import { describe, it, expect } from 'vitest';
import { CATALOGO } from './catalogo';
import { MODULOS } from '../rotulos';
import { agruparBlocos, achatar, proximoIndice } from './painelBlocos.pesquisa';

/**
 * O painel de blocos tem de ser operável só com teclado. A navegação depende
 * de a lista achatada seguir exactamente a ordem que se vê no ecrã — é isso
 * que estes testes fixam.
 */
describe('agruparBlocos', () => {
  it('sem pesquisa devolve as três categorias, por ordem', () => {
    const grupos = agruparBlocos(CATALOGO, '');

    expect(grupos.map((g) => g.categoria)).toEqual(['Gatilhos', 'Ações', 'Fluxo']);
  });

  it('procura no nome e na descrição', () => {
    const porNome = agruparBlocos(CATALOGO, 'renting');
    expect(achatar(porNome).map((t) => t.chave)).toContain('trigger-renting');

    // "extintor" só aparece na descrição do bloco Viaturas.
    const porDescricao = agruparBlocos(CATALOGO, 'inspeção');
    expect(achatar(porDescricao).map((t) => t.chave)).toContain('trigger-viaturas');
  });

  it('ignora acentos e maiúsculas', () => {
    // Quem escreve depressa não põe acentos; exigi-los tornava a pesquisa
    // inútil em português.
    const comAcento = achatar(agruparBlocos(CATALOGO, 'Assistência'));
    const semAcento = achatar(agruparBlocos(CATALOGO, 'assistencia'));

    expect(semAcento.map((t) => t.chave)).toEqual(comAcento.map((t) => t.chave));
    expect(semAcento.length).toBeGreaterThan(0);
  });

  it('categorias sem resultados desaparecem em vez de ficarem vazias', () => {
    const grupos = agruparBlocos(CATALOGO, 'renting');

    expect(grupos.every((g) => g.itens.length > 0)).toBe(true);
    expect(grupos.map((g) => g.categoria)).toEqual(['Gatilhos']);
  });

  it('pesquisa sem resultados devolve lista vazia, não tudo', () => {
    // Cair para "mostra tudo" fazia parecer que a pesquisa não funcionava.
    expect(agruparBlocos(CATALOGO, 'zzzzz')).toEqual([]);
  });

  it('o filtro de módulo restringe os gatilhos e deixa o resto', () => {
    // Acções e condições não pertencem a módulo nenhum — escondê-las ao
    // filtrar deixava o utilizador sem forma de acrescentar o passo seguinte.
    const grupos = agruparBlocos(CATALOGO, '', 'viatura');
    const gatilhos = grupos.find((g) => g.categoria === 'Gatilhos');

    expect(gatilhos?.itens.map((t) => t.chave)).toEqual(['trigger-viaturas']);
    expect(grupos.find((g) => g.categoria === 'Ações')?.itens.length).toBeGreaterThan(0);
  });

  /**
   * O guarda que faltava.
   *
   * O teste acima passa-lhe `'viatura'` à mão e sempre passou. Mas o filtro da
   * barra guardava o NOME do módulo ('Viaturas') e era esse valor que chegava
   * aqui — nunca casava com `dados.modulo`, e filtrar por módulo na lista
   * deixava a paleta do canvas sem um único gatilho, em silêncio.
   *
   * Provar que a função funciona não é provar que o chamador lhe dá o que ela
   * espera. Isto liga os dois vocabulários: o que o filtro guarda é o que a
   * paleta reconhece.
   */
  it('toda a chave de MODULOS com gatilho na paleta encontra esse gatilho', () => {
    const comGatilho = MODULOS.filter((m) =>
      CATALOGO.some(
        (t) => t.tipo === 'trigger' && (t.dados as { modulo?: string }).modulo === m.chave
      )
    );

    // Se isto for zero, o teste passa sem testar nada.
    expect(comGatilho.length).toBeGreaterThan(0);

    for (const modulo of comGatilho) {
      const gatilhos = agruparBlocos(CATALOGO, '', modulo.chave).find(
        (g) => g.categoria === 'Gatilhos'
      );
      expect(gatilhos?.itens.length, `módulo ${modulo.chave} ficou sem gatilho`).toBeGreaterThan(0);
    }
  });
});

describe('achatar', () => {
  it('segue a ordem visual dos grupos — é o que as setas percorrem', () => {
    const grupos = agruparBlocos(CATALOGO, '');
    const plano = achatar(grupos);

    expect(plano[0]).toBe(grupos[0].itens[0]);
    expect(plano.at(-1)).toBe(grupos.at(-1)?.itens.at(-1));
    expect(plano).toHaveLength(CATALOGO.length);
  });
});

describe('proximoIndice', () => {
  it('anda para a frente e para trás', () => {
    expect(proximoIndice(0, 3, 1)).toBe(1);
    expect(proximoIndice(2, 3, -1)).toBe(1);
  });

  it('dá a volta nas duas pontas', () => {
    // Sem wrap, a seta para baixo encravava no último e parecia avariada.
    expect(proximoIndice(2, 3, 1)).toBe(0);
    expect(proximoIndice(0, 3, -1)).toBe(2);
  });

  it('lista vazia devolve 0 em vez de -1 ou NaN', () => {
    expect(proximoIndice(0, 0, 1)).toBe(0);
  });
});
