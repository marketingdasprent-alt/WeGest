import type jsPDF from 'jspdf';

// Ticket #9: as folhas impressas eram rubricadas à mão uma a uma. A rubrica é a
// assinatura de quem gera o documento ("Minha conta"), em pequeno, na margem
// direita de cada folha, à altura da primeira linha (zona livre nos timbrados).
export const RUBRICA_LARGURA_MAX = 16;
export const RUBRICA_ALTURA_MAX = 8;

/** Assinatura de quem imprime; na folha de danos da entrega vem como "responsável". */
export function rubricaDoDocumento(dados: Record<string, unknown>): string | null {
  for (const chave of ['assinatura_colaborador', 'assinatura_responsavel']) {
    const valor = dados[chave];
    if (typeof valor === 'string' && valor.startsWith('data:image')) return valor;
  }
  return null;
}

/** Cabe em 16 x 8 mm sem deformar a assinatura. */
export function tamanhoRubrica(larguraPx: number, alturaPx: number): { w: number; h: number } {
  if (!(larguraPx > 0) || !(alturaPx > 0)) {
    return { w: RUBRICA_LARGURA_MAX, h: RUBRICA_ALTURA_MAX };
  }
  const escala = Math.min(RUBRICA_LARGURA_MAX / larguraPx, RUBRICA_ALTURA_MAX / alturaPx);
  return { w: larguraPx * escala, h: alturaPx * escala };
}

interface FolhasDoDocumento {
  startPage: number;
  endPage: number;
  pageWidth: number;
  rightMargin: number;
  topMargin: number;
}

type PdfRubrica = Pick<jsPDF, 'setPage' | 'addImage' | 'getImageProperties'>;

export function desenharRubricaNasFolhas(
  pdf: PdfRubrica,
  rubrica: string,
  folhas: FolhasDoDocumento
): void {
  let props: { width: number; height: number; fileType: string };
  try {
    props = pdf.getImageProperties(rubrica);
  } catch (error: unknown) {
    console.warn('[documentos] Assinatura ilegível; as folhas saem sem rubrica.', error);
    return;
  }
  const { w, h } = tamanhoRubrica(props.width, props.height);
  const x = folhas.pageWidth - folhas.rightMargin + (folhas.rightMargin - w) / 2;
  for (let pagina = folhas.startPage; pagina <= folhas.endPage; pagina++) {
    pdf.setPage(pagina);
    pdf.addImage(rubrica, props.fileType || 'PNG', x, folhas.topMargin, w, h);
  }
}
