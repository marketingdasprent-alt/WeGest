import { describe, it, expect, vi } from 'vitest';

import {
  RUBRICA_ALTURA_MAX,
  RUBRICA_LARGURA_MAX,
  desenharRubricaNasFolhas,
  rubricaDoDocumento,
  tamanhoRubrica,
} from './rubrica';

const PNG = 'data:image/png;base64,AAAA';

describe('rubricaDoDocumento', () => {
  it('usa a assinatura de quem imprime', () => {
    expect(rubricaDoDocumento({ assinatura_colaborador: PNG })).toBe(PNG);
  });

  it('na folha de danos da entrega, a do responsável', () => {
    expect(rubricaDoDocumento({ assinatura_colaborador: '', assinatura_responsavel: PNG })).toBe(
      PNG
    );
  });

  it('sem assinatura desenhada não há rubrica', () => {
    expect(rubricaDoDocumento({})).toBeNull();
    expect(rubricaDoDocumento({ assinatura_colaborador: 'https://x/assinatura.png' })).toBeNull();
  });
});

describe('tamanhoRubrica', () => {
  it('assinatura larga encosta à largura máxima sem deformar', () => {
    const { w, h } = tamanhoRubrica(400, 100);
    expect(w).toBeCloseTo(RUBRICA_LARGURA_MAX);
    expect(h).toBeCloseTo(4);
  });

  it('assinatura alta encosta à altura máxima', () => {
    const { w, h } = tamanhoRubrica(100, 200);
    expect(h).toBeCloseTo(RUBRICA_ALTURA_MAX);
    expect(w).toBeCloseTo(4);
  });
});

function pdfFalso(props: { width: number; height: number; fileType: string } | Error) {
  return {
    setPage: vi.fn(),
    addImage: vi.fn(),
    getImageProperties: vi.fn(() => {
      if (props instanceof Error) throw props;
      return props;
    }),
  };
}

const FOLHAS = { startPage: 3, endPage: 5, pageWidth: 210, rightMargin: 20, topMargin: 55 };

describe('desenharRubricaNasFolhas', () => {
  it('rubrica cada folha do documento, na margem direita à altura da primeira linha', () => {
    const pdf = pdfFalso({ width: 400, height: 100, fileType: 'PNG' });
    desenharRubricaNasFolhas(pdf as never, PNG, FOLHAS);

    expect(pdf.setPage.mock.calls.map((c) => c[0])).toEqual([3, 4, 5]);
    expect(pdf.addImage).toHaveBeenCalledTimes(3);
    const [src, formato, x, y, w, h] = pdf.addImage.mock.calls[0];
    expect(src).toBe(PNG);
    expect(formato).toBe('PNG');
    // Centrada nos 20 mm da margem: começa em 192 e acaba em 208.
    expect(x).toBeCloseTo(192);
    expect(x + w).toBeLessThanOrEqual(210);
    expect(y).toBe(55);
    expect(h).toBeCloseTo(4);
  });

  it('assinatura ilegível: as folhas saem sem rubrica e o documento não falha', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pdf = pdfFalso(new Error('imagem inválida'));
    expect(() => desenharRubricaNasFolhas(pdf as never, PNG, FOLHAS)).not.toThrow();
    expect(pdf.addImage).not.toHaveBeenCalled();
  });
});

describe('desenharRubricaNasFolhas com o jsPDF real', () => {
  // PNG verdadeiro de 1x1: confirma que o jsPDF aceita a assinatura como vem do perfil.
  const PNG_REAL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  it('põe a imagem em todas as folhas do documento', async () => {
    const { default: JsPDF } = await import('jspdf');
    const pdf = new JsPDF({ unit: 'mm', format: 'a4' });
    pdf.addPage();
    pdf.addPage();
    const addImage = vi.spyOn(pdf, 'addImage');

    desenharRubricaNasFolhas(pdf, PNG_REAL, { ...FOLHAS, startPage: 1, endPage: 3 });

    expect(addImage).toHaveBeenCalledTimes(3);
    expect(pdf.output('datauristring').length).toBeGreaterThan(0);
  });
});
