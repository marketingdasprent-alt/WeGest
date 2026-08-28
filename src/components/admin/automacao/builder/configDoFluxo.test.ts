import { describe, it, expect } from 'vitest';
import type { AutomationNode as Node } from './dominio/tipos';
import { configDoFluxo } from './configDoFluxo';

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
      enviarEmail: true,
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

describe('configDoFluxo', () => {
  it('lê os destinatários, o email e o cooldown da acção', () => {
    const config = configDoFluxo([accao()]);

    expect(config).toMatchObject({
      cargoIds: ['c1'],
      enviarEmail: true,
      cooldownMinutos: 1440,
    });
  });

  it('devolve o modo e as pessoas escolhidas', () => {
    const config = configDoFluxo([accao({ modo: 'individual', userIds: ['u1'] })]);

    expect(config).toMatchObject({ modo: 'individual', userIds: ['u1'] });
  });

  it('modo individual sem ninguém escolhido cai para grupo', () => {
    // Gravar 'individual' com a lista vazia deixava a regra sem destinatário
    // nenhum e sem nada no ecrã a dizê-lo.
    const config = configDoFluxo([accao({ modo: 'individual', userIds: [] })]);

    expect(config?.modo).toBe('grupo');
  });

  it('o nó de erro não entra na configuração gravada', () => {
    // É um indicador vindo do histórico, não um passo que o utilizador desenhou.
    const erro = {
      id: 'e1',
      type: 'erro',
      position: { x: 800, y: 0 },
      data: { runId: 'r', erro: 'boom', falhas: 2 },
    } as Node;
    const config = configDoFluxo([accao(), erro]);

    expect(config?.condicoes).toEqual([]);
    expect(config).toMatchObject({ cargoIds: ['c1'] });
  });

  it('sem acção não há nada para gravar', () => {
    // Um canvas só com o gatilho não é uma regra — devolver um objecto vazio
    // fazia o "Guardar" apagar os destinatários que estavam lá.
    expect(configDoFluxo([])).toBeNull();
    expect(configDoFluxo([condicao('a', 0)])).toBeNull();
  });

  it('as condições saem pela ordem em que estão no canvas', () => {
    // A ordem importa para quem lê a regra depois; a ordem do array reflecte
    // a de criação, não a que está no ecrã.
    const config = configDoFluxo([
      accao({}, 900),
      condicao('segundo', 400),
      condicao('primeiro', 100),
    ]);

    expect(config?.condicoes.map((c) => c.campo)).toEqual(['primeiro', 'segundo']);
  });

  it('condição largada e não configurada não vai para a base de dados', () => {
    // Um bloco sem campo é ruído: o motor compararia contra um campo vazio.
    const config = configDoFluxo([accao(), condicao('', 100), condicao('bom', 200)]);

    expect(config?.condicoes).toEqual([{ campo: 'bom', operador: '=', valor: 'v' }]);
  });

  it('sem condições devolve um array vazio, não undefined', () => {
    // `[]` é o que o motor lê como "sem filtros"; undefined apagava a coluna.
    expect(configDoFluxo([accao()])?.condicoes).toEqual([]);
  });

  it('campos em falta na acção caem para valores seguros', () => {
    const config = configDoFluxo([
      { id: 'a1', type: 'accao', position: { x: 0, y: 0 }, data: { accao: 'notificacao' } },
    ]);

    expect(config).toMatchObject({ cargoIds: [], enviarEmail: false, modo: 'grupo', userIds: [] });
    expect(typeof config?.cooldownMinutos).toBe('number');
  });

  it('ignora acções que não sejam de notificação', () => {
    // 'alterar_estado' não tem para onde ser gravado hoje; tratá-lo como
    // notificação escrevia destinatários vazios por cima dos reais.
    const config = configDoFluxo([
      { id: 'a1', type: 'accao', position: { x: 0, y: 0 }, data: { accao: 'alterar_estado' } },
    ]);

    expect(config).toBeNull();
  });
});
