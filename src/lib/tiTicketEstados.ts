/**
 * Estados de um ticket de TI e as passagens permitidas entre eles.
 *
 * Vive aqui, numa função pura, porque a edge function `ti-sugestao-responder` e a UI
 * precisam da mesma regra. Escrita em cada um deles, a regra "não ajudou
 * volta ao admin" divergiria — e já aconteceu neste repo: duas cópias da mesma
 * regra de composição de PDFs produziram dois bugs (61e9e12, 8424214).
 */
export type EstadoTicket = 'aberto' | 'com_sugestao' | 'nao_resolvido' | 'presencial' | 'resolvido';

export type EventoTicket =
  | 'sugerir'
  | 'foi_util'
  | 'nao_ajudou'
  | 'marcar_presencial'
  | 'fechar'
  | 'reabrir';

const TRANSICOES: Record<EstadoTicket, Partial<Record<EventoTicket, EstadoTicket>>> = {
  aberto: { sugerir: 'com_sugestao', marcar_presencial: 'presencial', fechar: 'resolvido' },
  com_sugestao: {
    foi_util: 'resolvido',
    nao_ajudou: 'nao_resolvido',
    marcar_presencial: 'presencial',
    fechar: 'resolvido',
  },
  nao_resolvido: { sugerir: 'com_sugestao', marcar_presencial: 'presencial', fechar: 'resolvido' },
  presencial: { sugerir: 'com_sugestao', fechar: 'resolvido' },
  // Reabrir devolve o ticket a `nao_resolvido`, não a `aberto`: um pedido que já
  // passou por aqui e voltou precisa de atenção, e é isso que `nao_resolvido`
  // significa na lista do admin. Voltar a `aberto` apagaria o sinal de que já se
  // tentou resolver.
  resolvido: { reabrir: 'nao_resolvido' },
};

/** `null` = transição não permitida. Quem chama decide o erro a mostrar. */
export function proximoEstado(actual: EstadoTicket, evento: EventoTicket): EstadoTicket | null {
  return TRANSICOES[actual]?.[evento] ?? null;
}

/**
 * O que a bolinha do dashboard conta: tudo o que ainda não está resolvido.
 *
 * Derivado de `TRANSICOES` em vez de escrito à mão, para que um estado novo na
 * máquina de estados passe a contar sozinho. Uma segunda lista escrita à parte
 * ficava desactualizada em silêncio, e o sintoma seria o pior possível: pedidos
 * a existir sem aparecerem no aviso.
 */
export const ESTADOS_POR_RESOLVER: readonly EstadoTicket[] = (
  Object.keys(TRANSICOES) as EstadoTicket[]
).filter((estado) => estado !== 'resolvido');
