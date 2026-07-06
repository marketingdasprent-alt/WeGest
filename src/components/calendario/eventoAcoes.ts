export type EventoAcao = 'realizar-renting' | 'checkin-legacy' | 'nenhuma';

interface EventoAcaoInput {
  origem_tipo: string | null;
  tipo: string;
  realizado_em: string | null;
}

/**
 * Decide se um evento de calendário tem ação de realização/check-in.
 * - Renting (contrato_renting): só entrega/recolha abrem via token de deep-link.
 * - Legacy (contrato/movimento): recolha/devolução/troca abrem check-in directo.
 * Eventos já realizados, ou tipos sem caminho de realização (ex. 'troca' em
 * contrato_renting — ver eventoAcoes.test.ts), não têm ação.
 */
export function getEventoAcao(evento: EventoAcaoInput): EventoAcao {
  if (evento.realizado_em) return 'nenhuma';

  if (
    evento.origem_tipo === 'contrato_renting' &&
    (evento.tipo === 'entrega' || evento.tipo === 'recolha')
  ) {
    return 'realizar-renting';
  }

  if (
    (evento.origem_tipo === 'contrato' || evento.origem_tipo === 'movimento') &&
    (evento.tipo === 'recolha' || evento.tipo === 'devolucao' || evento.tipo === 'troca')
  ) {
    return 'checkin-legacy';
  }

  return 'nenhuma';
}
