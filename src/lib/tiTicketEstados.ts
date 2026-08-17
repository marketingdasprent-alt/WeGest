/**
 * Estados de um ticket de TI e as passagens permitidas entre eles.
 *
 * Vive aqui, numa funcao pura, porque as tres edge functions publicas e a UI
 * precisam todas da mesma regra. Escrita em cada um deles, a regra "nao ajudou
 * volta ao admin" divergiria — e ja aconteceu neste repo: duas copias da mesma
 * regra de composicao de PDFs produziram dois bugs (61e9e12, 0d88851).
 */
export type EstadoTicket = 'aberto' | 'com_sugestao' | 'nao_resolvido' | 'presencial' | 'resolvido';

export type EventoTicket = 'sugerir' | 'foi_util' | 'nao_ajudou' | 'marcar_presencial' | 'fechar';

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
  resolvido: {},
};

/** `null` = transicao nao permitida. Quem chama decide o erro a mostrar. */
export function proximoEstado(actual: EstadoTicket, evento: EventoTicket): EstadoTicket | null {
  return TRANSICOES[actual]?.[evento] ?? null;
}
