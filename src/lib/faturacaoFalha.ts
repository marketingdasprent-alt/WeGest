import { errorMessage } from '@/utils/errorMessage';

export type RegistoLocal = 'fatura' | 'reserva';

/** Mensagens com o motivo são longas: os 4 s por omissão do sonner não chegam para ler. */
export const DURACAO_AVISO_FALHA_MS = 15_000;

/**
 * Aviso para quando o registo contabilístico ficou gravado mas o emissor
 * fiscal recusou. Leva o motivo: sem ele, 25 emissões da Dasp Rent Sul
 * falharam em Setembro de 2026 e ninguém soube porquê.
 */
export function mensagemFalhaEmissao(erro: unknown, registo: RegistoLocal = 'fatura'): string {
  const inicio = registo === 'reserva' ? 'Reserva faturada' : 'Fatura registada';
  const motivo = errorMessage(erro, 'motivo desconhecido');
  return (
    `${inicio} na conta-corrente, mas o documento fiscal NÃO foi emitido. ` +
    `Motivo: ${motivo}. ` +
    'Reemita-o na lista de faturas — até lá não existe documento para entregar ao cliente.'
  );
}
