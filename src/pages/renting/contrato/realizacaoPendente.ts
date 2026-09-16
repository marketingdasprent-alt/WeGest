import type { ContratoRenting } from '@/types/contratoRenting';

export function tipoRealizacaoPendenteEsperada(
  contrato: Pick<ContratoRenting, 'estado_operacional' | 'substituido_em'> | null | undefined
): 'entrega' | 'recolha' | null {
  if (!contrato || contrato.substituido_em) return null;
  if (contrato.estado_operacional === 'agendado') return 'entrega';
  if (contrato.estado_operacional === 'em_curso') return 'recolha';
  return null;
}
