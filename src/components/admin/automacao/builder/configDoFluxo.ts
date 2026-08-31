import type { AutomationNode as Node } from './dominio/tipos';
import type { CondicaoGravada } from './fluxoDaRegra';

/**
 * O caminho inverso da hidratação: do canvas para a configuração da regra.
 *
 * Devolve `null` quando o canvas não descreve uma regra gravável — e isso é
 * deliberado. Um objecto vazio faria o "Guardar" escrever destinatários vazios
 * por cima dos que estão em produção.
 */

export interface ConfigDoFluxo {
  /** O que vai para `acao_tipo`. */
  acaoTipo: 'notificacao' | 'email' | 'automacao_interna';
  /** Preenchido só quando `acaoTipo` é 'automacao_interna'. */
  acaoInterna: { accao: string; campo?: string; valor: string } | null;
  /** Destinatários — usados por 'notificacao' e por 'email', que escolhem
   * pessoas da mesma maneira. */
  cargoIds: string[];
  modo: 'grupo' | 'individual';
  userIds: string[];
  cooldownMinutos: number;
  condicoes: CondicaoGravada[];
}

/** O mesmo valor por omissão das regras que já existem. */
const COOLDOWN_PADRAO_MINUTOS = 1440;

export function configDoFluxo(nodes: Node[]): ConfigDoFluxo | null {
  const accao = nodes.find((n) => n.type === 'accao');
  if (!accao) return null;

  const dados = accao.data as {
    accao?: string;
    acaoTipo?: string;
    campo?: string;
    valor?: string;
    cargoIds?: string[];
    modo?: 'grupo' | 'individual';
    userIds?: string[];
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

  const condicoes = nodes
    .filter((n) => n.type === 'condicao')
    // Ordem visual, não a de criação: é a que quem lê a regra vê no ecrã.
    .sort((a, b) => a.position.x - b.position.x)
    .map((n) => n.data as unknown as CondicaoGravada)
    // Um bloco largado e não configurado é ruído — o motor compararia o
    // evento contra um campo vazio.
    .filter((c) => c.campo?.trim())
    .map((c) => ({ campo: c.campo, operador: c.operador, valor: c.valor }));

  return {
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
    cooldownMinutos: dados.cooldownMinutos ?? COOLDOWN_PADRAO_MINUTOS,
    condicoes,
  };
}
