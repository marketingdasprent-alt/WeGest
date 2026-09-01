import { describe, it, expect } from 'vitest';
import type { AutomationNode as Node, AutomationEdge as Edge } from './dominio/tipos';
import { configsDoFluxo } from './configDoFluxo';

/**
 * O caminho inverso da hidratação: do canvas de volta para a configuração da
 * regra. É aqui que uma distração apaga dados de produção, por isso o que se
 * testa é sobretudo o que NÃO deve sair.
 */
function accao(data: Record<string, unknown> = {}, x = 400): Node {
  return {
    id: 'a1',
    type: 'accao',
    position: { x, y: 0 },
    data: {
      accao: 'notificacao',
      cargoIds: ['c1'],
      modo: 'grupo',
      userIds: [],
      cooldownMinutos: 1440,
      ...data,
    },
  };
}

function condicao(campo: string, x: number, over: Record<string, unknown> = {}): Node {
  return {
    id: `c-${campo}-${x}`,
    type: 'condicao',
    position: { x, y: 0 },
    data: { campo, operador: '=', valor: 'v', ...over },
  };
}

function gatilho(): Node {
  return { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: {} };
}

function ligar(source: string, target: string): Edge {
  return { id: `${source}--${target}`, source, target };
}

describe('configsDoFluxo', () => {
  it('lê os destinatários e o cooldown da acção', () => {
    const acc = accao();
    const configs = configsDoFluxo([gatilho(), acc], [ligar('t', acc.id)]);

    expect(configs?.[0]).toMatchObject({
      cargoIds: ['c1'],
      cooldownMinutos: 1440,
    });
  });

  it('devolve o modo e as pessoas escolhidas', () => {
    const acc = accao({ modo: 'individual', userIds: ['u1'] });
    const configs = configsDoFluxo([gatilho(), acc], [ligar('t', acc.id)]);

    expect(configs?.[0]).toMatchObject({ modo: 'individual', userIds: ['u1'] });
  });

  it('modo individual sem ninguém escolhido cai para grupo', () => {
    // Gravar 'individual' com a lista vazia deixava a regra sem destinatário
    // nenhum e sem nada no ecrã a dizê-lo.
    const acc = accao({ modo: 'individual', userIds: [] });
    const configs = configsDoFluxo([gatilho(), acc], [ligar('t', acc.id)]);

    expect(configs?.[0].modo).toBe('grupo');
  });

  it('o nó de erro não entra na configuração gravada', () => {
    // É um indicador vindo do histórico, não um passo que o utilizador desenhou.
    const acc = accao();
    const erro = {
      id: 'e1',
      type: 'erro',
      position: { x: 800, y: 0 },
      data: { runId: 'r', erro: 'boom', falhas: 2 },
    } as Node;
    const configs = configsDoFluxo([gatilho(), acc, erro], [ligar('t', acc.id)]);

    expect(configs?.[0].condicoes).toEqual([]);
    expect(configs?.[0]).toMatchObject({ cargoIds: ['c1'] });
  });

  it('sem acção não há nada para gravar', () => {
    // Um canvas só com o gatilho não é uma regra — devolver um objecto vazio
    // fazia o "Guardar" apagar os destinatários que estavam lá.
    expect(configsDoFluxo([gatilho()], [])).toBeNull();
    expect(configsDoFluxo([gatilho(), condicao('a', 0)], [])).toBeNull();
  });

  it('as condições saem pela ordem em que estão no caminho até à acção', () => {
    // A ordem importa para quem lê a regra depois; a ordem do array reflecte
    // a do caminho gatilho→...→acção, não a de criação.
    const c1 = condicao('primeiro', 100);
    const c2 = condicao('segundo', 400);
    const acc = accao({}, 900);
    const configs = configsDoFluxo(
      [gatilho(), c1, c2, acc],
      [ligar('t', c1.id), ligar(c1.id, c2.id), ligar(c2.id, acc.id)]
    );

    expect(configs?.[0].condicoes.map((c) => c.campo)).toEqual(['primeiro', 'segundo']);
  });

  it('condição largada e não configurada não vai para a base de dados', () => {
    // Um bloco sem campo é ruído: o motor compararia contra um campo vazio.
    const cVazia = condicao('', 100);
    const cBoa = condicao('bom', 200);
    const acc = accao({}, 300);
    const configs = configsDoFluxo(
      [gatilho(), cVazia, cBoa, acc],
      [ligar('t', cVazia.id), ligar(cVazia.id, cBoa.id), ligar(cBoa.id, acc.id)]
    );

    expect(configs?.[0].condicoes).toEqual([{ campo: 'bom', operador: '=', valor: 'v' }]);
  });

  it('sem condições devolve um array vazio, não undefined', () => {
    // `[]` é o que o motor lê como "sem filtros"; undefined apagava a coluna.
    const acc = accao();
    expect(configsDoFluxo([gatilho(), acc], [ligar('t', acc.id)])?.[0].condicoes).toEqual([]);
  });

  it('campos em falta na acção caem para valores seguros', () => {
    const acc: Node = { id: 'a1', type: 'accao', position: { x: 0, y: 0 }, data: { accao: 'notificacao' } };
    const configs = configsDoFluxo([gatilho(), acc], [ligar('t', 'a1')]);

    expect(configs?.[0]).toMatchObject({ cargoIds: [], modo: 'grupo', userIds: [] });
    expect(typeof configs?.[0].cooldownMinutos).toBe('number');
  });

  it('ignora acções que não sejam de notificação', () => {
    // 'alterar_estado' não tem para onde ser gravado hoje; tratá-lo como
    // notificação escrevia destinatários vazios por cima dos reais.
    const acc: Node = { id: 'a1', type: 'accao', position: { x: 0, y: 0 }, data: { accao: 'alterar_estado' } };
    const configs = configsDoFluxo([gatilho(), acc], [ligar('t', 'a1')]);

    expect(configs).toBeNull();
  });

  it('duas acções ligadas ao gatilho devolvem duas configurações', () => {
    const a1 = accao({}, 320);
    a1.id = 'a1';
    const a2 = accao({ accao: 'email', acaoTipo: 'email' }, 320);
    a2.id = 'a2';

    const configs = configsDoFluxo([gatilho(), a1, a2], [ligar('t', 'a1'), ligar('t', 'a2')]);

    expect(configs).toHaveLength(2);
    expect(configs?.map((c) => c.acaoTipo).sort()).toEqual(['email', 'notificacao']);
  });

  it('uma condição entre o gatilho e só uma das duas acções só filtra essa', () => {
    const c1: Node = {
      id: 'c1',
      type: 'condicao',
      position: { x: 320, y: 0 },
      data: { campo: 'x', operador: '=', valor: 'y' },
    };
    const a1 = accao({}, 640);
    a1.id = 'a1';
    const a2 = accao({ accao: 'email', acaoTipo: 'email' }, 320);
    a2.id = 'a2';

    const configs = configsDoFluxo(
      [gatilho(), c1, a1, a2],
      [ligar('t', 'c1'), ligar('c1', 'a1'), ligar('t', 'a2')]
    );
    const doA1 = configs?.find((c) => c.acaoTipo === 'notificacao');
    const doA2 = configs?.find((c) => c.acaoTipo === 'email');

    expect(doA1?.condicoes).toEqual([{ campo: 'x', operador: '=', valor: 'y' }]);
    expect(doA2?.condicoes).toEqual([]);
  });

  it('uma acção sem caminho até ao gatilho falha fechado', () => {
    const acc = accao();
    // sem aresta nenhuma a ligar — a acção está solta no canvas
    expect(configsDoFluxo([gatilho(), acc], [])).toBeNull();
  });

  it('uma acção de email produz acaoTipo email com os mesmos destinatários', () => {
    // Notificação e email escolhem pessoas da mesma forma — só o tipo muda.
    const acc = accao({ accao: 'email', acaoTipo: 'email', cargoIds: ['c1', 'c2'] });
    const configs = configsDoFluxo([gatilho(), acc], [ligar('t', acc.id)]);

    expect(configs?.[0].acaoTipo).toBe('email');
    expect(configs?.[0].cargoIds).toEqual(['c1', 'c2']);
    // O email nunca teve a flag — não sobra rasto dela no resultado.
    expect(configs?.[0]).not.toHaveProperty('enviarEmail');
  });

  it('uma acção de email devolve os endereços livres', () => {
    const acc = accao({ accao: 'email', acaoTipo: 'email', emailsLivres: ['a@b.pt', 'c@d.pt'] });
    const configs = configsDoFluxo([gatilho(), acc], [ligar('t', acc.id)]);

    expect(configs?.[0].emailsLivres).toEqual(['a@b.pt', 'c@d.pt']);
  });

  it('uma acção de notificação nunca devolve emailsLivres — nem vazio', () => {
    // null, não []: escrever [] gravava a chave na acao_config, e o validador
    // recusa destinatarios_emails_livres numa notificação mesmo vazia.
    const acc = accao();
    const configs = configsDoFluxo([gatilho(), acc], [ligar('t', acc.id)]);

    expect(configs?.[0].emailsLivres).toBeNull();
  });

  it('uma acção de email sem nenhum endereço livre devolve array vazio, não null', () => {
    const acc = accao({ accao: 'email', acaoTipo: 'email' });
    const configs = configsDoFluxo([gatilho(), acc], [ligar('t', acc.id)]);

    expect(configs?.[0].emailsLivres).toEqual([]);
  });

  it('uma volta completa: hidratar uma acção existente, acrescentar uma acção nova, gravar', () => {
    const existente = accao();
    existente.id = 'accao-r1';
    const novoNo: Node = {
      id: 'email-1',
      type: 'accao',
      position: { x: 320, y: 200 },
      data: {
        accao: 'email',
        acaoTipo: 'email',
        cargoIds: [],
        modo: 'grupo',
        userIds: [],
        emailsLivres: [],
        cooldownMinutos: 1440,
      },
    };

    const configs = configsDoFluxo(
      [gatilho(), existente, novoNo],
      [ligar('t', 'accao-r1'), ligar('t', 'email-1')]
    );

    expect(configs).toHaveLength(2);
    const novaConfig = configs?.find((c) => c.noId === 'email-1');
    expect(novaConfig?.acaoTipo).toBe('email');
  });
});
