import { describe, expect, it } from 'vitest';
import type { AutomationNode as Node } from './dominio/tipos';
import type { AutomationRuleAcaoConfig } from '@/hooks/automacao/useAutomationRulesConfig';
import { configDoFluxo } from './configDoFluxo';
import { semChavesDeEmailAntigo } from './EditorAutomacaoProvider';
import { fluxoDaRegra } from './fluxoDaRegra';
import { paraValorJson } from './valorTipado';

/**
 * Do estado do formulário até ao que seria enviado ao Supabase.
 *
 * Os testes isolados provam cada peça; este prova a corrente. É onde se apanha
 * um campo que se perde entre a extracção e a persistência — e essa perda não
 * dá erro nenhum: grava configuração incompleta por cima da que estava certa.
 *
 * O `payload` aqui reproduz exactamente o que `EditorAutomacaoProvider` monta
 * antes de chamar a mutação. Se aquele bloco mudar, este teste tem de mudar
 * com ele — é esse o ponto.
 */

/** O que o provider constrói a partir do que `configDoFluxo` extraiu. */
function payloadParaSupabase(
  nodes: Node[],
  configExistente: Record<string, unknown> = {}
): Record<string, unknown> | null {
  const extraida = configDoFluxo(nodes);
  if (!extraida) return null;

  return {
    acao_tipo: extraida.acaoTipo,
    // Usa a MESMA função que EditorAutomacaoProvider — não uma reimplementação
    // paralela que podia divergir dela sem os testes notarem.
    acao_config: extraida.acaoInterna
      ? extraida.acaoInterna
      : {
          ...(extraida.acaoTipo === 'notificacao'
            ? semChavesDeEmailAntigo(configExistente as unknown as AutomationRuleAcaoConfig)
            : configExistente),
          destinatarios_cargo_ids: extraida.cargoIds,
          destinatarios_modo: extraida.modo,
          destinatarios_user_ids: extraida.userIds,
        },
    cooldown_minutos: extraida.cooldownMinutos,
    condicoes: extraida.condicoes,
  };
}

function trigger(): Node {
  return {
    id: 't1',
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: { eventType: 'assistencia_ticket.aberto_demasiado_tempo', modulo: 'Assistência' },
  };
}

function condicao(campo: string, operador: string, valor: unknown): Node {
  return {
    id: `c-${campo}`,
    type: 'condicao',
    position: { x: 320, y: 0 },
    data: { campo, operador, valor },
  };
}

function accaoInterna(data: Record<string, unknown>): Node {
  return {
    id: 'a1',
    type: 'accao',
    position: { x: 640, y: 0 },
    data: { acaoTipo: 'automacao_interna', cooldownMinutos: 1440, ...data },
  };
}

describe('caso 1 — ticket aberto há demasiado tempo', () => {
  it('produz exactamente o payload que o motor espera', () => {
    const payload = payloadParaSupabase([
      trigger(),
      condicao('prioridade', '!=', paraValorJson('urgente', 'string')),
      accaoInterna({ accao: 'ticket.alterar_estado', valor: 'em_andamento' }),
    ]);

    expect(payload).toEqual({
      acao_tipo: 'automacao_interna',
      acao_config: { accao: 'ticket.alterar_estado', valor: 'em_andamento' },
      cooldown_minutos: 1440,
      condicoes: [{ campo: 'prioridade', operador: '!=', valor: 'urgente' }],
    });
  });

  it('não inclui `campo` numa acção de conjunto fechado', () => {
    // `ticket.alterar_estado` não tem `campos_permitidos`. Mandar `campo: ''`
    // era configuração que o validador do servidor recusa.
    const payload = payloadParaSupabase([
      accaoInterna({ accao: 'ticket.alterar_estado', valor: 'fechado' }),
    ]);
    expect(payload?.acao_config).not.toHaveProperty('campo');
  });
});

describe('caso 2 — ficha de motorista incompleta', () => {
  it('grava a acção com campo e valor, sem condições', () => {
    const payload = payloadParaSupabase([
      accaoInterna({
        accao: 'motorista.atualizar_campo',
        campo: 'observacoes',
        valor: 'Verificar documentação pendente',
      }),
    ]);

    expect(payload?.acao_config).toEqual({
      accao: 'motorista.atualizar_campo',
      campo: 'observacoes',
      valor: 'Verificar documentação pendente',
    });
    expect(payload?.condicoes).toEqual([]);
  });
});

describe('caso 3 — seguro da viatura a expirar', () => {
  it('grava a acção da viatura', () => {
    const payload = payloadParaSupabase([
      accaoInterna({
        accao: 'viatura.atualizar_campo',
        campo: 'observacoes',
        valor: 'Rever seguro',
      }),
    ]);

    expect(payload?.acao_config).toEqual({
      accao: 'viatura.atualizar_campo',
      campo: 'observacoes',
      valor: 'Rever seguro',
    });
  });
});

/**
 * Nenhum dos três eventos do catálogo declara hoje um campo `number` ou
 * `boolean` — todos são `string`. Estes testes guardam o MECANISMO para o dia
 * em que declararem: sem eles, o primeiro campo numérico gravaria "500" e a
 * automação nunca dispararia, sem erro nenhum a dizê-lo.
 */
describe('tipagem das condições até ao payload', () => {
  it('um número chega ao payload como número', () => {
    const payload = payloadParaSupabase([
      condicao('valor_total', '=', paraValorJson('500', 'number')),
      accaoInterna({ accao: 'ticket.alterar_estado', valor: 'aberto' }),
    ]);
    const condicoes = payload?.condicoes as Array<{ valor: unknown }>;
    expect(condicoes[0].valor).toBe(500);
    expect(typeof condicoes[0].valor).toBe('number');
  });

  it('um boolean chega como boolean, não como a string "false"', () => {
    const payload = payloadParaSupabase([
      condicao('status_ativo', '=', paraValorJson('false', 'boolean')),
      accaoInterna({ accao: 'ticket.alterar_estado', valor: 'aberto' }),
    ]);
    const condicoes = payload?.condicoes as Array<{ valor: unknown }>;
    expect(condicoes[0].valor).toBe(false);
    expect(typeof condicoes[0].valor).toBe('boolean');
  });

  it('uma string continua string', () => {
    const payload = payloadParaSupabase([
      condicao('status', '=', paraValorJson('aberto', 'string')),
      accaoInterna({ accao: 'ticket.alterar_estado', valor: 'aberto' }),
    ]);
    const condicoes = payload?.condicoes as Array<{ valor: unknown }>;
    expect(condicoes[0].valor).toBe('aberto');
    expect(typeof condicoes[0].valor).toBe('string');
  });
});

describe('recusas', () => {
  it('não grava uma acção interna sem acção escolhida', () => {
    // Gravar aqui escreveria uma config vazia por cima da real, e o servidor
    // rejeitaria com «acção interna não existe no catálogo».
    expect(payloadParaSupabase([accaoInterna({ accao: '', valor: 'x' })])).toBeNull();
  });
});

describe('compatibilidade com as notificações', () => {
  it('uma regra de notificação continua a produzir o payload de sempre', () => {
    const payload = payloadParaSupabase(
      [
        {
          id: 'a1',
          type: 'accao',
          position: { x: 0, y: 0 },
          data: {
            accao: 'notificacao',
            acaoTipo: 'notificacao',
            cargoIds: ['c1'],
            modo: 'grupo',
            userIds: [],
            cooldownMinutos: 60,
          },
        },
      ],
      { template_codigo: 'algo.existente', titulo: 'Título' }
    );

    expect(payload?.acao_tipo).toBe('notificacao');
    // FUNDE: o template e o título não passam pelo editor e não podem
    // desaparecer ao gravar.
    expect(payload?.acao_config).toMatchObject({
      template_codigo: 'algo.existente',
      titulo: 'Título',
      destinatarios_cargo_ids: ['c1'],
    });
  });

  it('uma regra de notificação anterior à divisão perde o enviar_email ao ser gravada', () => {
    // `enviar_email` deixou de ser válido numa notificação desde 2026-09-01 —
    // o email tem acção própria, e o validador do servidor recusa a chave. Uma
    // regra antiga que ainda a tivesse ficaria presa: qualquer alteração seria
    // recusada por um campo que o próprio editor já não escreve.
    const payload = payloadParaSupabase(
      [
        {
          id: 'a1',
          type: 'accao',
          position: { x: 0, y: 0 },
          data: {
            accao: 'notificacao',
            acaoTipo: 'notificacao',
            cargoIds: ['c1'],
            modo: 'grupo',
            userIds: [],
            cooldownMinutos: 60,
          },
        },
      ],
      { template_codigo: 'legado', titulo: 'Título', enviar_email: true, enviar_email_digest: true }
    );

    expect(payload?.acao_config).not.toHaveProperty('enviar_email');
    expect(payload?.acao_config).not.toHaveProperty('enviar_email_digest');
  });
});

describe('a acção de email', () => {
  it('produz acao_tipo email e os mesmos destinatários da notificação', () => {
    const payload = payloadParaSupabase(
      [
        {
          id: 'a1',
          type: 'accao',
          position: { x: 0, y: 0 },
          data: {
            accao: 'email',
            acaoTipo: 'email',
            cargoIds: ['c1'],
            modo: 'grupo',
            userIds: [],
            cooldownMinutos: 1440,
          },
        },
      ],
      { template_codigo: 'aviso.email', titulo: 'Aviso' }
    );

    expect(payload?.acao_tipo).toBe('email');
    expect(payload?.acao_config).toMatchObject({
      template_codigo: 'aviso.email',
      titulo: 'Aviso',
      destinatarios_cargo_ids: ['c1'],
    });
    expect(payload?.acao_config).not.toHaveProperty('enviar_email');
  });

  it('preserva enviar_email_digest — continua válido para email', () => {
    const payload = payloadParaSupabase(
      [
        {
          id: 'a1',
          type: 'accao',
          position: { x: 0, y: 0 },
          data: {
            accao: 'email',
            acaoTipo: 'email',
            cargoIds: ['c1'],
            modo: 'grupo',
            userIds: [],
            cooldownMinutos: 1440,
          },
        },
      ],
      { template_codigo: 'aviso.email', titulo: 'Aviso', enviar_email_digest: true }
    );

    expect(payload?.acao_config).toMatchObject({ enviar_email_digest: true });
  });
});

describe('reabrir uma automação interna já gravada', () => {
  it('reconstrói acção, campo e valor no nó', () => {
    const { nodes } = fluxoDaRegra({
      ruleId: 'r1',
      nome: 'Regra',
      eventType: 'viatura.seguro_expirando',
      cooldownMinutos: 1440,
      cargoIds: [],
      modo: 'grupo',
      userIds: [],
      condicoes: [],
      acaoTipo: 'automacao_interna',
      acaoConfig: {
        accao: 'viatura.atualizar_campo',
        campo: 'observacoes',
        valor: 'Rever seguro',
      },
      ativo: true,
      ultimaExecucao: null,
      duracaoMediaMs: null,
      falhas: 0,
      ultimaFalha: null,
    });

    const no = nodes.find((n) => n.type === 'accao');
    expect(no?.data).toMatchObject({
      acaoTipo: 'automacao_interna',
      accao: 'viatura.atualizar_campo',
      campo: 'observacoes',
      valor: 'Rever seguro',
    });
  });

  it('e o que sai do canvas é igual ao que lá entrou', () => {
    const acaoConfig = {
      accao: 'ticket.alterar_estado',
      valor: 'em_andamento',
    };

    const { nodes } = fluxoDaRegra({
      ruleId: 'r1',
      nome: 'Regra',
      eventType: 'assistencia_ticket.aberto_demasiado_tempo',
      cooldownMinutos: 1440,
      cargoIds: [],
      modo: 'grupo',
      userIds: [],
      condicoes: [{ campo: 'prioridade', operador: '!=', valor: 'urgente' }],
      acaoTipo: 'automacao_interna',
      acaoConfig,
      ativo: true,
      ultimaExecucao: null,
      duracaoMediaMs: null,
      falhas: 0,
      ultimaFalha: null,
    });

    // Ida e volta sem perdas: é isto que impede que abrir e gravar uma
    // automação sem lhe tocar a altere.
    const payload = payloadParaSupabase(nodes);
    expect(payload?.acao_config).toEqual(acaoConfig);
    expect(payload?.condicoes).toEqual([{ campo: 'prioridade', operador: '!=', valor: 'urgente' }]);
  });
});
