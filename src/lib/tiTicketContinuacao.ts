/**
 * Leitura de um pedido que já passou por uma tentativa de resolução.
 *
 * Vive fora do componente porque é a regra que decide o que o admin lê no
 * cabeçalho do pedido — "2.ª tentativa", e o que falhou na primeira. Dentro do
 * JSX ficava sem testes e por provar; aqui é uma função pura com entradas
 * óbvias.
 */

export interface SugestaoRespondida {
  /** `null` = o autor ainda não respondeu. `false` = disse que não resolveu. */
  util: boolean | null;
  /** O que o autor escreveu ao recusar. Opcional — pode recusar sem explicar. */
  resposta_texto?: string | null;
  created_at: string;
}

export interface ResumoContinuacao {
  /** Sugestões já enviadas. */
  tentativas: number;
  /** Número da sugestão que o admin vai escrever a seguir. */
  proximaTentativa: number;
  /** Houve pelo menos uma recusa — alguém tem de voltar a olhar para isto. */
  ehContinuacao: boolean;
  /** Explicação da recusa mais recente, ou `null` se não a escreveu. */
  ultimaExplicacao: string | null;
}

/**
 * Da mais antiga para a mais recente. A query não garante ordem nenhuma, e sem
 * isto "Tentativa 1" acabava a apontar para a sugestão errada.
 */
export function ordenarSugestoes<T extends { created_at: string }>(sugestoes: T[]): T[] {
  return [...sugestoes].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function resumoContinuacao(sugestoes: SugestaoRespondida[]): ResumoContinuacao {
  const ordenadas = ordenarSugestoes(sugestoes);
  const recusadas = ordenadas.filter((s) => s.util === false);
  // A última recusa, e só ela. Procurar "a última recusa com texto" faria uma
  // explicação antiga passar por ser a do ciclo actual.
  const ultima = recusadas.at(-1);
  const texto = ultima?.resposta_texto?.trim();

  return {
    tentativas: ordenadas.length,
    proximaTentativa: ordenadas.length + 1,
    ehContinuacao: recusadas.length > 0,
    ultimaExplicacao: texto ? texto : null,
  };
}
