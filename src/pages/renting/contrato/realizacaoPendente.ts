import type { ContratoRenting } from '@/types/contratoRenting';

/**
 * Que realização está pendente para o estado do contrato:
 *   agendado → 'entrega' · em_curso → 'recolha' · outros/substituído → null.
 *
 * IMPORTANTE: isto NÃO depende do estado financeiro — e não pode voltar a
 * depender. A fatura congela os valores fiscais (por trigger na BD), não o
 * ciclo operacional. Um guard `!isFacturado` aqui escondia para sempre a
 * única forma de confirmar a entrega no fluxo "criar + faturar à cabeça"
 * (ex.: #611 BL-60-FQ ficou preso em "Agendado" com o carro na rua).
 * O teste "FATURADO não esconde…" em realizacaoPendente.test.ts é o
 * sentinela desta regra.
 */
export function tipoRealizacaoPendenteEsperada(
  contrato: Pick<ContratoRenting, 'estado_operacional' | 'substituido_em'> | null | undefined
): 'entrega' | 'recolha' | null {
  if (!contrato || contrato.substituido_em) return null;
  if (contrato.estado_operacional === 'agendado') return 'entrega';
  if (contrato.estado_operacional === 'em_curso') return 'recolha';
  return null;
}
