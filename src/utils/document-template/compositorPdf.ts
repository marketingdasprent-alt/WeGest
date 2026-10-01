import type jsPDF from 'jspdf';

export interface CompositorPdf {
  anexar(
    gerar: (existente: jsPDF | undefined) => Promise<jsPDF | undefined> | jsPDF | undefined
  ): Promise<jsPDF | undefined>;

  readonly pdf: jsPDF | undefined;
}

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
