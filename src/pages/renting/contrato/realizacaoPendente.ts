import type { ContratoRenting } from '@/types/contratoRenting';

/**
 * Que realização está pendente: agendado → 'entrega', em_curso → 'recolha',
 * outros/substituído → null. NÃO depende do estado financeiro — um guard
 * `!isFacturado` já escondeu a confirmação de entrega no fluxo "criar +
 * faturar à cabeça" (#611 BL-60-FQ preso em "Agendado" com o carro na rua).
 */
export function tipoRealizacaoPendenteEsperada(
  contrato: Pick<ContratoRenting, 'estado_operacional' | 'substituido_em'> | null | undefined
): 'entrega' | 'recolha' | null {
  if (!contrato || contrato.substituido_em) return null;
  if (contrato.estado_operacional === 'agendado') return 'entrega';
  if (contrato.estado_operacional === 'em_curso') return 'recolha';
  return null;
}
