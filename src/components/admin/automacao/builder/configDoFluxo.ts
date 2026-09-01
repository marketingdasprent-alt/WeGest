import type { AutomationNode as Node, AutomationEdge as Edge } from './dominio/tipos';
import type { CondicaoGravada } from './fluxoDaRegra';

/**
 * O caminho inverso da hidratação: do canvas para a configuração da regra.
 *
 * Devolve `null` quando o canvas não descreve uma regra gravável — e isso é
 * deliberado. Um objecto vazio faria o "Guardar" escrever destinatários vazios
 * por cima dos que estão em produção.
 */

export interface ConfigDoFluxo {
  /** O id do nó de acção no canvas — liga esta config ao nó que a gerou;
   * o diff em EditorAutomacaoProvider usa-o para saber a que regra-irmã (ou
   * "nenhuma ainda") corresponde cada configuração. */
  noId: string;
  /** O que vai para `acao_tipo`. */
  acaoTipo: 'notificacao' | 'email' | 'automacao_interna';
  /** Preenchido só quando `acaoTipo` é 'automacao_interna'. */
  acaoInterna: { accao: string; campo?: string; valor: string } | null;
  /** Destinatários — usados por 'notificacao' e por 'email', que escolhem
   * pessoas da mesma maneira. */
  cargoIds: string[];
  modo: 'grupo' | 'individual';
  userIds: string[];
  /** Só para 'email' — null nos outros tipos, para nunca gravar a chave numa
   * notificação (o validador do servidor recusa-a mesmo vazia). */
  emailsLivres: string[] | null;
  cooldownMinutos: number;
  condicoes: CondicaoGravada[];
}

/** O mesmo valor por omissão das regras que já existem. */
const COOLDOWN_PADRAO_MINUTOS = 1440;

/**
 * Percorre a árvore a partir do gatilho e devolve uma configuração por
 * acção alcançável — cada uma com as condições do SEU caminho, não as de
 * outro ramo.
 *
 * Falha fechado: um grafo malformado (acção sem caminho até ao gatilho,
 * zero acções) devolve null — nada se grava sobre configuração real.
 */
export function configsDoFluxo(nodes: Node[], edges: Edge[]): ConfigDoFluxo[] | null {
  const gatilho = nodes.find((n) => n.type === 'trigger');
  if (!gatilho) return null;

  const accoes = nodes.filter((n) => n.type === 'accao');
  if (accoes.length === 0) return null;

  const configs: ConfigDoFluxo[] = [];

  for (const accao of accoes) {
    const caminho = caminhoAteAoGatilho(accao.id, gatilho.id, edges);
    // Sem caminho até ao gatilho: a acção está solta no canvas — não é uma
    // regra gravável, e fingir que é apagava a config real por cima.
    if (!caminho) return null;

    const condicoes = caminho
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is Node => n?.type === 'condicao')
      .map((n) => n.data as unknown as CondicaoGravada)
      .filter((c) => c.campo?.trim())
      .map((c) => ({ campo: c.campo, operador: c.operador, valor: c.valor }));

    const config = configDoUmaAccao(accao, condicoes);
    if (!config) return null;
    configs.push(config);
  }

  return configs;
}

/** Os ids do caminho gatilho→...→acção, ou null se não houver nenhum (a
 * acção não está ligada a nada, ou está ligada a algo que não chega ao
 * gatilho). Assume a árvore que `validarLigacao` já impõe — um nó, uma
 * entrada — por isso não há ambiguidade de qual é "o" caminho. */
function caminhoAteAoGatilho(accaoId: string, gatilhoId: string, edges: Edge[]): string[] | null {
  const caminho: string[] = [];
  let actual = accaoId;
  const vistos = new Set<string>();

  while (actual !== gatilhoId) {
    if (vistos.has(actual)) return null; // ciclo — nunca devia acontecer com a árvore imposta
    vistos.add(actual);
    const entrada = edges.find((e) => e.target === actual);
    if (!entrada) return null; // sem ligação a entrar e ainda não chegou ao gatilho
    caminho.unshift(entrada.source);
    actual = entrada.source;
  }
  return caminho;
}

function configDoUmaAccao(accao: Node, condicoes: CondicaoGravada[]): ConfigDoFluxo | null {
  const dados = accao.data as {
    accao?: string;
    acaoTipo?: string;
    campo?: string;
    valor?: string;
    cargoIds?: string[];
    modo?: 'grupo' | 'individual';
    userIds?: string[];
    emailsLivres?: string[];
    cooldownMinutos?: number;
  };

  const interna = dados.acaoTipo === 'automacao_interna';
  // O email escolhe destinatários da mesma forma que a notificação — a
  // diferença está só no `acao_tipo` gravado e em não ter aviso na app.
  const email = dados.acaoTipo === 'email';

  // Uma acção interna sem acção escolhida não é gravável: o servidor recusaria
  // com «acção interna não existe no catálogo», e gravar por cima da config
  // real com um vazio era pior do que não gravar.
  if (interna && !dados.accao) return null;

  // Fora da acção interna e do email, só o bloco de notificação é gravável.
  // Um nó de acção com outro `accao` faz esta função devolver null — que é a
  // forma de impedir que destinatários vazios sejam escritos por cima dos
  // reais.
  if (!interna && !email && dados.accao !== 'notificacao') return null;

  // 'individual' com a lista vazia deixava a regra sem destinatário nenhum e
  // sem nada no ecrã a dizê-lo.
  const userIds = dados.userIds ?? [];
  const modo = dados.modo === 'individual' && userIds.length > 0 ? 'individual' : 'grupo';

  return {
    // O id do nó de acção no canvas — liga esta config ao nó que a gerou;
    // o diff em EditorAutomacaoProvider usa-o para saber a que regra-irmã
    // (ou "nenhuma ainda") corresponde cada configuração.
    noId: accao.id,
    acaoTipo: interna ? 'automacao_interna' : email ? 'email' : 'notificacao',
    // As chaves são as do servidor. `campo` só vai quando existe: as acções de
    // conjunto fechado não o têm, e mandá-lo vazio seria configuração que o
    // validador recusa.
    acaoInterna: interna
      ? {
          accao: dados.accao as string,
          ...(dados.campo ? { campo: dados.campo } : {}),
          valor: dados.valor ?? '',
        }
      : null,
    cargoIds: dados.cargoIds ?? [],
    modo,
    userIds,
    emailsLivres: email ? (dados.emailsLivres ?? []) : null,
    cooldownMinutos: dados.cooldownMinutos ?? COOLDOWN_PADRAO_MINUTOS,
    condicoes,
  };
}
