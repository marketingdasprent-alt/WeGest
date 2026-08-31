import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';
import { moduloDoEventType } from './catalogo';

/**
 * Carrega uma regra existente no canvas.
 *
 * É o que liga a lista ao editor: escolher uma automação abre-a aqui, com a
 * configuração que está gravada e com o que se sabe das execuções. Se esta
 * transformação perder um campo, o utilizador grava por cima da configuração
 * real com um vazio — por isso o princípio é levar tudo, mesmo o que o painel
 * ainda não mostra.
 */

export interface CondicaoGravada {
  campo: string;
  operador: string;
  /** O valor JSON tal como está gravado — texto, número ou boolean. */
  valor: string | number | boolean;
}

/** A última execução falhada, quando existe. */
export interface FalhaConhecida {
  runId: string;
  erro: string;
  quando: string;
}

export interface RegraParaEditar {
  ruleId: string;
  nome: string;
  eventType: string;
  cooldownMinutos: number;
  cargoIds: string[];
  /** 'individual' = só as pessoas em `userIds`, dentro dos cargos escolhidos. */
  modo: 'grupo' | 'individual';
  userIds: string[];
  condicoes: CondicaoGravada[];
  /** 'notificacao' | 'email' | 'automacao_interna'. Decide o que o nó da acção mostra. */
  acaoTipo: string;
  /** A `acao_config` crua, levada inteira para o nó — o painel lê dela o que
   * precisa. Levar só os campos que hoje se mostram apagava o resto ao gravar. */
  acaoConfig: Record<string, unknown>;
  /** Estado da regra e do que já correu — vem das estatísticas, não da config. */
  ativo: boolean;
  ultimaExecucao: string | null;
  duracaoMediaMs: number | null;
  falhas: number;
  ultimaFalha: FalhaConhecida | null;
}

/** Espaço entre passos da corrente. Uma regra cabe num ecrã, logo sem grelha. */
const PASSO_X = 320;

function ligar(origem: string, destino: string): Edge {
  return { id: `${origem}--${destino}`, source: origem, target: destino };
}

/**
 * O estado que o cartão mostra sem ser preciso abrir o painel.
 *
 * "Nunca correu" não é sucesso: pintar de verde uma automação que ainda não
 * disparou dava confiança que ninguém verificou.
 */
function estadoDaAccao(regra: RegraParaEditar): 'normal' | 'sucesso' | 'erro' {
  if (regra.ultimaFalha) return 'erro';
  if (regra.ultimaExecucao) return 'sucesso';
  return 'normal';
}

export function fluxoDaRegra(regra: RegraParaEditar): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let passo = 0;

  const idGatilho = `trigger-${regra.ruleId}`;
  nodes.push({
    id: idGatilho,
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: {
      modulo: moduloDoEventType(regra.eventType),
      rotulo: regra.nome,
      eventType: regra.eventType,
      ativo: regra.ativo,
    },
  });
  passo += 1;

  let anterior = idGatilho;

  regra.condicoes.forEach((condicao, i) => {
    // Índice no id: duas condições sobre o mesmo campo são legítimas, e sem
    // ele partilhariam id — o React Flow colapsava-as numa só.
    const id = `condicao-${regra.ruleId}-${i}`;
    nodes.push({
      id,
      type: 'condicao',
      position: { x: passo * PASSO_X, y: 0 },
      data: {
        rotulo: 'Só se',
        campo: condicao.campo,
        operador: condicao.operador,
        valor: condicao.valor,
      },
    });
    edges.push(ligar(anterior, id));
    anterior = id;
    passo += 1;
  });

  const idAccao = `accao-${regra.ruleId}`;
  nodes.push({
    id: idAccao,
    type: 'accao',
    position: { x: passo * PASSO_X, y: 0 },
    data: {
      // `accao` continua a ser o discriminante que o nó e o painel usam. Para
      // uma automação interna passa a ser o id da acção do catálogo, que é
      // exactamente o que fica gravado em `acao_config.accao`.
      accao:
        regra.acaoTipo === 'automacao_interna'
          ? ((regra.acaoConfig.accao as string) ?? '')
          : regra.acaoTipo === 'email'
            ? 'email'
            : 'notificacao',
      acaoTipo: regra.acaoTipo,
      rotulo:
        regra.acaoTipo === 'automacao_interna'
          ? 'Executar acção'
          : regra.acaoTipo === 'email'
            ? 'Enviar email'
            : 'Enviar notificação',
      // Config da acção interna, reconstruída ao abrir. Sem isto, editar uma
      // automação interna existente perdia o campo e o valor.
      campo: (regra.acaoConfig.campo as string) ?? '',
      valor: (regra.acaoConfig.valor as string) ?? '',
      cargoIds: regra.cargoIds,
      modo: regra.modo,
      userIds: regra.userIds,
      emailsLivres: (regra.acaoConfig.destinatarios_emails_livres as string[] | undefined) ?? [],
      cooldownMinutos: regra.cooldownMinutos,
      ativo: regra.ativo,
      estado: estadoDaAccao(regra),
      ultimaExecucao: regra.ultimaExecucao,
      duracaoMediaMs: regra.duracaoMediaMs,
    },
  });
  edges.push(ligar(anterior, idAccao));
  passo += 1;

  // Só com run conhecido: um nó vermelho sem mensagem nem `runId` não tem o
  // que depurar, e ocupa o lugar de quem tem mesmo informação. Acontece quando
  // o run já saiu da janela de retenção mas o contador de falhas não.
  if (regra.ultimaFalha) {
    const idErro = `erro-${regra.ruleId}`;
    nodes.push({
      id: idErro,
      type: 'erro',
      position: { x: passo * PASSO_X, y: 0 },
      data: {
        runId: regra.ultimaFalha.runId,
        erro: regra.ultimaFalha.erro,
        quando: regra.ultimaFalha.quando,
        falhas: regra.falhas,
      },
    });
    edges.push(ligar(idAccao, idErro));
  }

  return { nodes, edges };
}
