import type jsPDF from 'jspdf';

/**
 * Junta vários documentos num único PDF.
 *
 * A regra é sempre a mesma, e existe aqui uma vez só porque estava escrita à
 * mão em três sítios com pressupostos diferentes — daí terem saído PDFs com
 * documentos sobrepostos num ecrã e sem a primeira página noutro:
 *
 * 1. Os geradores (`generateDocumentFromTemplate`, `gerarFolhaDanos`) escrevem
 *    na página CORRENTE do PDF que recebem e nunca criam uma para si próprios.
 *    Quem compõe é que manda na paginação.
 * 2. O PRIMEIRO documento cria o PDF. Criá-lo antes seria criar já uma folha em
 *    branco (o jsPDF nasce com uma página), que alguém teria depois de apagar —
 *    e apagar a página 1 é precisamente como se perdia a primeira página do
 *    primeiro documento.
 * 3. A página separadora vai ENTRE documentos: antes de cada um a partir do
 *    segundo. Nunca à cabeça, nunca no fim.
 *
 * Nota conhecida: se um documento rebentar a meio, a página separadora que já
 * lhe tinha sido criada fica em branco. É o mesmo que acontecia antes, e nesse
 * cenário o PDF está incompleto de qualquer forma (o chamador mostra o erro).
 */
export interface CompositorPdf {
  /**
   * Corre `gerar` sobre o PDF acumulado, tratando da página separadora. O
   * `existente` chega a `undefined` no primeiro documento — é isso que faz o
   * gerador criar o PDF em vez de escrever num já feito.
   */
  anexar(
    gerar: (existente: jsPDF | undefined) => Promise<jsPDF | undefined> | jsPDF | undefined
  ): Promise<jsPDF | undefined>;
  /** O PDF acumulado, ou `undefined` enquanto nada tiver sido gerado. */
  readonly pdf: jsPDF | undefined;
}

/**
 * @param combinar `false` faz de `anexar` uma passagem directa: cada documento
 * é gerado isolado e trata da sua própria saída (guardar/imprimir). É o caso de
 * um único documento seleccionado.
 */
export function criarCompositorPdf(combinar: boolean): CompositorPdf {
  let acumulado: jsPDF | undefined;

  return {
    async anexar(gerar) {
      if (!combinar) return await gerar(undefined);

      if (acumulado) acumulado.addPage();
      const produzido = await gerar(acumulado);
      if (!acumulado && produzido) acumulado = produzido;
      return produzido;
    },
    get pdf() {
      return acumulado;
    },
  };
}
