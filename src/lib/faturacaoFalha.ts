import { errorMessage } from '@/utils/errorMessage';

export type RegistoLocal = 'fatura' | 'reserva' | 'nota_credito';

/** Mensagens com o motivo são longas: os 4 s por omissão do sonner não chegam para ler. */
export const DURACAO_AVISO_FALHA_MS = 15_000;

/**
 * Aviso para quando o registo contabilístico ficou gravado mas o emissor
 * fiscal recusou. Leva o motivo: sem ele, 25 emissões da Dasp Rent Sul
 * falharam em Setembro de 2026 e ninguém soube porquê.
 */
export function mensagemFalhaEmissao(erro: unknown, registo: RegistoLocal = 'fatura'): string {
  const motivo = motivoLegivel(erro);
  if (registo === 'nota_credito') return mensagemNotaCredito(motivo, classeDoErro(erro));
  const inicio = registo === 'reserva' ? 'Reserva faturada' : 'Fatura registada';
  // 'unknown': o fornecedor pode ter emitido (ex.: o agente Primavera apanhou o pedido
  // e não respondeu); mandar reemitir aqui duplicava o documento fiscal.
  if (classeDoErro(erro) === 'unknown') {
    return (
      `${inicio} na conta-corrente, mas não se sabe se o documento fiscal foi emitido — PODE ter sido. ` +
      `Motivo: ${motivo}. ` +
      'Confirme no software de faturação antes de reemitir; reemitir sem confirmar pode duplicar o documento.'
    );
  }
  return (
    `${inicio} na conta-corrente, mas o documento fiscal NÃO foi emitido. ` +
    `Motivo: ${motivo}. ` +
    'Reemita-o na lista de faturas — até lá não existe documento para entregar ao cliente.'
  );
}

function motivoLegivel(erro: unknown): string {
  // O motivo costuma já acabar em ponto; sem isto saía "emitido.." no ecrã.
  return (
    errorMessage(erro, 'motivo desconhecido')
      .trim()
      .replace(/[\s.!?;:…]+$/, '') || 'motivo desconhecido'
  );
}

function mensagemNotaCredito(motivo: string, classe: string | undefined): string {
  if (classe === 'unknown') {
    return (
      'Crédito registado na conta-corrente, mas não se sabe se a nota de crédito foi emitida — PODE ter sido. ' +
      `Motivo: ${motivo}. ` +
      'Confirme no software de faturação antes de emitir outra; emitir sem confirmar pode duplicar o documento.'
    );
  }
  return (
    'Crédito registado na conta-corrente, mas a nota de crédito NÃO foi emitida. ' +
    `Motivo: ${motivo}. ` +
    'Reemita-a na lista de documentos — até lá não existe documento para o cliente.'
  );
}

function classeDoErro(erro: unknown): string | undefined {
  if (typeof erro !== 'object' || erro === null) return undefined;
  const classe = (erro as { classe?: unknown }).classe;
  return typeof classe === 'string' ? classe : undefined;
}
