/**
 * Helpers puros para ClienteReservasContratosTab
 */

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function getEstadoBadgeColor(estado: string): string {
  const activeStates = ['pendente', 'confirmada', 'em_curso', 'agendado'];
  const concludedStates = ['concluida', 'fechado', 'devolvido'];
  const cancelledStates = ['cancelada', 'cancelado', 'expirada', 'anulado'];

  if (activeStates.includes(estado)) return 'bg-blue-100 text-blue-800';
  if (concludedStates.includes(estado)) return 'bg-emerald-100 text-emerald-800';
  if (cancelledStates.includes(estado)) return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
}
