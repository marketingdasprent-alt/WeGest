export type EventoAcao = 'realizar-renting' | 'checkin-legacy' | 'nenhuma';

interface EventoAcaoInput {
  origem_tipo?: string | null;
  tipo: string;
  realizado_em: string | null;
}

/**
 * Decide se um evento de calendário tem ação de realização/check-in.
 * - Renting (contrato_renting): entrega/recolha/troca abrem via token de deep-link.
 * - Legacy (contrato/movimento): recolha/devolução/troca abrem check-in directo.
 * Eventos já realizados não têm ação.
 */
export function getEventoAcao(evento: EventoAcaoInput): EventoAcao {
  if (evento.realizado_em) return 'nenhuma';

  if (
    evento.origem_tipo === 'contrato_renting' &&
    (evento.tipo === 'entrega' || evento.tipo === 'recolha' || evento.tipo === 'troca')
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
