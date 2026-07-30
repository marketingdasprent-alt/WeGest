// Métricas de prova social. REGRA INVIOLÁVEL: só entram números reais e
// verificáveis. Uma métrica sem valor (`valor: null`) simplesmente não
// renderiza — ver ProvaSection. Isto existe para que seja impossível pôr um
// número inventado em produção por distração.
//
// Ao atualizar, atualizar também `atualizadoEm`.

export interface Metrica {
  /** Identificador estável para a key do React. */
  key: string;
  /** null = ainda não temos o número → a métrica não aparece na página. */
  valor: number | null;
  /** Prefixo antes do número, ex. "+" ou "mais de". */
  prefixo?: string;
  /** Sufixo depois do número, ex. "%". */
  sufixo?: string;
  /** O que o número significa, em linguagem do cliente. */
  rotulo: string;
}

/** Data da última confirmação dos números com o cliente. */
export const PROVA_ATUALIZADO_EM = '2026-07-30';

export const METRICAS: Metrica[] = [
  {
    key: 'empresas',
    valor: 3,
    rotulo: 'empresas a gerir a frota no WeGest',
  },
  {
    key: 'viaturas',
    valor: 100,
    prefixo: 'mais de',
    rotulo: 'viaturas sob gestão',
  },
  // Slots preparados. Preencher `valor` e a métrica aparece sozinha na
  // secção de Prova — nenhuma alteração de JSX é necessária.
  {
    key: 'anos',
    valor: null,
    rotulo: 'anos a gerir a nossa própria operação',
  },
  {
    key: 'contratos',
    valor: null,
    rotulo: 'contratos geridos no sistema',
  },
];

/** Só as métricas que têm número real. */
export const metricasPublicaveis = (): Metrica[] =>
  METRICAS.filter((metrica): metrica is Metrica & { valor: number } => metrica.valor !== null);
