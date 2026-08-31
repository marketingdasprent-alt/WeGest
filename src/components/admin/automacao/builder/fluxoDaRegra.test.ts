import { describe, it, expect } from 'vitest';
import { fluxoDaRegra, type RegraParaEditar } from './fluxoDaRegra';

/**
 * Abrir uma regra existente no construtor é o que liga a tabela ao editor.
 * Se esta transformação perder um campo, o utilizador grava por cima da
 * configuração real com um vazio — por isso o que interessa testar é que
 * NADA se perde no caminho.
 */
function regra(over: Partial<RegraParaEditar> = {}): RegraParaEditar {
  return {
    ruleId: 'r1',
    nome: 'Seguro de viatura a expirar',
    eventType: 'viatura.seguro_expirando',
    cooldownMinutos: 1440,
    cargoIds: ['cargo-1'],
    enviarEmail: true,
    modo: 'grupo',
    userIds: [],
    condicoes: [],
    acaoTipo: 'notificacao',
    acaoConfig: {},
    ativo: true,
    ultimaExecucao: null,
    duracaoMediaMs: null,
    falhas: 0,
    ultimaFalha: null,
    ...over,
  };
}

describe('fluxoDaRegra — estado de execução', () => {
  it('o gatilho sabe se a regra está ligada', () => {
    // O estado tem de ser perceptível no canvas sem abrir o painel.
    const { nodes } = fluxoDaRegra(regra({ ativo: false }));
    expect(nodes[0].data).toMatchObject({ ativo: false });
  });

  it('a acção leva a última execução e a duração média', () => {
    const { nodes } = fluxoDaRegra(
      regra({ ultimaExecucao: '2026-08-27T09:00:00Z', duracaoMediaMs: 2500 })
    );

    expect(nodes[1].data).toMatchObject({
      ultimaExecucao: '2026-08-27T09:00:00Z',
      duracaoMediaMs: 2500,
    });
  });

  it('regra que já correu sem falhar fica em sucesso', () => {
    const { nodes } = fluxoDaRegra(regra({ ultimaExecucao: '2026-08-27T09:00:00Z' }));
    expect(nodes[1].data).toMatchObject({ estado: 'sucesso' });
  });

  it('regra que nunca correu não fica em sucesso nem em erro', () => {
    // Pintar de verde uma automação que nunca disparou dava confiança falsa.
    const { nodes } = fluxoDaRegra(regra({ ultimaExecucao: null }));
    expect(nodes[1].data).toMatchObject({ estado: 'normal' });
  });

  it('regra com falha conhecida fica em erro', () => {
    const { nodes } = fluxoDaRegra(
      regra({
        ultimaExecucao: '2026-08-27T09:00:00Z',
        falhas: 3,
        ultimaFalha: { runId: 'run-1', erro: 'boom', quando: '2026-08-27T09:00:00Z' },
      })
    );

    expect(nodes.find((n) => n.type === 'accao')?.data).toMatchObject({ estado: 'erro' });
  });
});

describe('fluxoDaRegra — nó de erro', () => {
  const comFalha = () =>
    regra({
      falhas: 4,
      ultimaFalha: {
        runId: 'run-abc',
        erro: 'record has no field event_type',
        quando: '2026-08-25T08:20:00Z',
      },
    });

  it('acrescenta um nó de erro ligado à acção', () => {
    const { nodes, edges } = fluxoDaRegra(comFalha());

    const erro = nodes.find((n) => n.type === 'erro');
    const accao = nodes.find((n) => n.type === 'accao');
    expect(erro?.data).toMatchObject({
      runId: 'run-abc',
      erro: 'record has no field event_type',
      falhas: 4,
    });
    // Liga a partir da acção, não do gatilho: é a acção que falha.
    expect(edges.some((e) => e.source === accao?.id && e.target === erro?.id)).toBe(true);
  });

  it('sem falha conhecida não há nó de erro', () => {
    expect(fluxoDaRegra(regra()).nodes.some((n) => n.type === 'erro')).toBe(false);
  });

  it('contador de falhas sem run conhecido não cria nó vazio', () => {
    // Acontece quando o run saiu da janela de retenção mas o contador não.
    // Um nó vermelho sem mensagem nem runId não tem o que depurar.
    const { nodes } = fluxoDaRegra(regra({ falhas: 2, ultimaFalha: null }));
    expect(nodes.some((n) => n.type === 'erro')).toBe(false);
  });

  it('o nó de erro fica depois da acção, na mesma linha', () => {
    const { nodes } = fluxoDaRegra(comFalha());
    const accao = nodes.find((n) => n.type === 'accao');
    const erro = nodes.find((n) => n.type === 'erro');

    expect(erro?.position.y).toBe(accao?.position.y);
    expect(erro?.position.x).toBeGreaterThan(accao?.position.x ?? 0);
  });
});

describe('fluxoDaRegra', () => {
  it('uma regra simples vira gatilho + acção ligados', () => {
    const { nodes, edges } = fluxoDaRegra(regra());

    expect(nodes.map((n) => n.type)).toEqual(['trigger', 'accao']);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: nodes[0].id, target: nodes[1].id });
  });

  it('o gatilho abre já com o evento escolhido, não por configurar', () => {
    const { nodes } = fluxoDaRegra(regra({ eventType: 'motorista.carta_expirando' }));

    expect(nodes[0].data).toMatchObject({
      eventType: 'motorista.carta_expirando',
      modulo: 'motorista',
    });
  });

  it('o módulo vem do catálogo e não do prefixo cru do evento', () => {
    // 'invoice.*' pertence ao módulo Financeiro, cuja chave é 'cobranca'.
    // Usar o prefixo dava um módulo que o catálogo não conhece, e o bloco
    // ficava sem ícone, sem cor e sem lista de eventos.
    const { nodes } = fluxoDaRegra(regra({ eventType: 'invoice.nao_enviada_ao_cliente' }));

    expect(nodes[0].data).toMatchObject({ modulo: 'cobranca' });
  });

  it('a acção traz os cargos, o email e o cooldown que estavam gravados', () => {
    const { nodes } = fluxoDaRegra(
      regra({ cargoIds: ['c1', 'c2'], enviarEmail: false, cooldownMinutos: 60 })
    );

    expect(nodes[1].data).toMatchObject({
      accao: 'notificacao',
      cargoIds: ['c1', 'c2'],
      enviarEmail: false,
      cooldownMinutos: 60,
    });
  });

  it('traz o modo e as pessoas escolhidas à mão', () => {
    // Sem isto, abrir a automação no editor e voltar a gravar apagava quem
    // tinha sido escolhido individualmente dentro de um cargo.
    const { nodes } = fluxoDaRegra(regra({ modo: 'individual', userIds: ['user-1', 'user-2'] }));

    expect(nodes[1].data).toMatchObject({ modo: 'individual', userIds: ['user-1', 'user-2'] });
  });

  it('cada condição gravada vira um bloco, pela ordem, entre gatilho e acção', () => {
    const { nodes, edges } = fluxoDaRegra(
      regra({
        condicoes: [
          { campo: 'severidade', operador: '=', valor: 'alta' },
          { campo: 'origem', operador: '!=', valor: 'manual' },
        ],
      })
    );

    expect(nodes.map((n) => n.type)).toEqual(['trigger', 'condicao', 'condicao', 'accao']);
    expect(nodes[1].data).toMatchObject({ campo: 'severidade', operador: '=', valor: 'alta' });
    expect(nodes[2].data).toMatchObject({ campo: 'origem', operador: '!=', valor: 'manual' });
    // A corrente tem de ficar toda ligada, não com pontas soltas.
    expect(edges).toHaveLength(3);
  });

  it('os ids derivam do ruleId e não se repetem', () => {
    const { nodes } = fluxoDaRegra(
      regra({
        ruleId: 'r9',
        condicoes: [
          { campo: 'a', operador: '=', valor: '1' },
          { campo: 'b', operador: '=', valor: '2' },
        ],
      })
    );
    const ids = nodes.map((n) => n.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.includes('r9'))).toBe(true);
  });

  it('a corrente fica numa linha, da esquerda para a direita', () => {
    const { nodes } = fluxoDaRegra(
      regra({ condicoes: [{ campo: 'a', operador: '=', valor: '1' }] })
    );

    expect(new Set(nodes.map((n) => n.position.y)).size).toBe(1);
    const xs = nodes.map((n) => n.position.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(xs.length);
  });

  it('regra de um módulo desconhecido ainda abre, em vez de rebentar', () => {
    const { nodes } = fluxoDaRegra(regra({ eventType: 'coisa_nova.aconteceu' }));

    expect(nodes).toHaveLength(2);
    expect(nodes[0].data).toMatchObject({ eventType: 'coisa_nova.aconteceu' });
  });
});
