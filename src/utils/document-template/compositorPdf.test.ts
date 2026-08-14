import { describe, it, expect } from 'vitest';
import { criarCompositorPdf } from './compositorPdf';

/**
 * PDF falso que modela páginas a sério: cada página é a lista do que lhe foi
 * escrito. Contar chamadas a addPage não chegava — o que importa é em que
 * página ficou cada documento.
 */
class FakePdf {
  paginas: string[][] = [[]];
  atual = 0;

  addPage() {
    this.paginas.push([]);
    this.atual = this.paginas.length - 1;
  }

  escrever(conteudo: string) {
    this.paginas[this.atual].push(conteudo);
  }
}

/** Gerador com o mesmo contrato dos reais: escreve na página corrente do PDF
 *  que recebe e só cria um PDF quando não recebe nenhum. */
function gerador(conteudo: string, paginasExtra = 0) {
  return (existente: FakePdf | undefined) => {
    const pdf = existente ?? new FakePdf();
    pdf.escrever(conteudo);
    for (let i = 0; i < paginasExtra; i++) {
      pdf.addPage();
      pdf.escrever(`${conteudo}:continuacao`);
    }
    return pdf;
  };
}

describe('criarCompositorPdf', () => {
  it('não deixa folha em branco à cabeça — a página 1 é do primeiro documento', async () => {
    const c = criarCompositorPdf(true);

    await c.anexar(gerador('doc-a') as never);
    await c.anexar(gerador('doc-b') as never);

    const pdf = c.pdf as unknown as FakePdf;
    expect(pdf.paginas[0]).toContain('doc-a');
    expect(pdf.paginas[1]).toContain('doc-b');
    expect(pdf.paginas.length).toBe(2);
  });

  it('separa os documentos em vez de os sobrepor', async () => {
    const c = criarCompositorPdf(true);

    // O primeiro documento ocupa duas páginas.
    await c.anexar(gerador('doc-a', 1) as never);
    await c.anexar(gerador('doc-b') as never);

    const pdf = c.pdf as unknown as FakePdf;
    // O segundo documento não pode aterrar na última página do primeiro.
    expect(pdf.paginas[1]).toEqual(['doc-a:continuacao']);
    expect(pdf.paginas[2]).toEqual(['doc-b']);
  });

  it('põe uma separadora entre cada par e nenhuma no fim', async () => {
    const c = criarCompositorPdf(true);

    await c.anexar(gerador('doc-a') as never);
    await c.anexar(gerador('doc-b') as never);
    await c.anexar(gerador('doc-c') as never);

    const pdf = c.pdf as unknown as FakePdf;
    expect(pdf.paginas.length).toBe(3);
    expect(pdf.paginas.at(-1)).toContain('doc-c');
  });

  it('com combinar=false cada documento é gerado isolado', async () => {
    const c = criarCompositorPdf(false);

    const a = (await c.anexar(gerador('doc-a') as never)) as unknown as FakePdf;
    const b = (await c.anexar(gerador('doc-b') as never)) as unknown as FakePdf;

    expect(a).not.toBe(b);
    expect(a.paginas[0]).toEqual(['doc-a']);
    expect(b.paginas[0]).toEqual(['doc-b']);
    // Nada é acumulado — cada gerador trata da sua própria saída.
    expect(c.pdf).toBeUndefined();
  });
});
