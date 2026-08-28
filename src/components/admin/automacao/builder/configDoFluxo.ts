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
  cargoIds: string[];
  enviarEmail: boolean;
  modo: 'grupo' | 'individual';
  userIds: string[];
  cooldownMinutos: number;
  condicoes: CondicaoGravada[];
}

/** O mesmo valor por omissão das regras que já existem. */
const COOLDOWN_PADRAO_MINUTOS = 1440;

export function configDoFluxo(nodes: Node[]): ConfigDoFluxo | null {
  const accao = nodes.find(
    (n) => n.type === 'accao' && (n.data as { accao?: string }).accao === 'notificacao'
  );
  // 'alterar_estado' não tem hoje para onde ser gravado; tratá-lo como
  // notificação escrevia destinatários vazios por cima dos reais.
  if (!accao) return null;

  const dados = accao.data as {
    cargoIds?: string[];
    enviarEmail?: boolean;
    modo?: 'grupo' | 'individual';
    userIds?: string[];
    cooldownMinutos?: number;
  };

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
    cargoIds: dados.cargoIds ?? [],
    enviarEmail: dados.enviarEmail ?? false,
    modo,
    userIds,
    cooldownMinutos: dados.cooldownMinutos ?? COOLDOWN_PADRAO_MINUTOS,
    condicoes,
  };
}
