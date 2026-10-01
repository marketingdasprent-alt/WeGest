import { errorMessage } from '@/utils/errorMessage';

/** Índice da base que impede duas parcelas do mesmo plano na mesma semana. */
export const INDICE_UMA_PARCELA_POR_SEMANA = 'motorista_financeiro_uma_parcela_por_semana';

/**
 * O nº de parcelas tem de ser escrito por quem lança — um "1" por omissão
 * descontava o valor todo de uma vez. No acordo, 1 é permitido (só adia a
 * cobrança); em "Parcelas fixas", 1 seria um lançamento único.
 */
export function numeroDeParcelasValido(numSemanas: string, minimo: number): boolean {
  const n = Number(numSemanas);
  return numSemanas.trim() !== '' && Number.isInteger(n) && n >= minimo;
}

/** Mensagem para o toast, com a recusa do índice traduzida para a operadora. */
export function mensagemErroMovimento(error: unknown): string {
  const codigo = (error as { code?: unknown } | null)?.code;
  const msg = errorMessage(error);
  if (codigo === '23505' && msg.includes(INDICE_UMA_PARCELA_POR_SEMANA)) {
    return 'Já existe uma parcela deste plano nessa semana. Cada parcela tem de cair numa semana diferente.';
  }
  return msg;
}
