import { describe, it, expect } from 'vitest';
import { ficheirosColados } from './use-soltar-ficheiros';

function clipboard(ficheiros: File[], texto = '') {
  return { files: ficheiros as unknown as FileList, getData: () => texto };
}

describe('ficheirosColados', () => {
  it('um print colado vira anexo, com um nome que o distingue de outros prints', () => {
    const [f] = ficheirosColados(clipboard([new File(['x'], 'image.png', { type: 'image/png' })]));
    expect(f.name).toMatch(/^print-\d{6}\.png$/);
    expect(f.type).toBe('image/png');
  });

  it('um ficheiro copiado no explorador mantém o nome', () => {
    const pdf = new File(['x'], 'fatura.pdf', { type: 'application/pdf' });
    expect(ficheirosColados(clipboard([pdf]))[0].name).toBe('fatura.pdf');
  });

  it('se também há texto (células do Excel), é um colar de texto e não anexa nada', () => {
    const img = new File(['x'], 'image.png', { type: 'image/png' });
    expect(ficheirosColados(clipboard([img], 'A1\tB1'))).toEqual([]);
  });

  it('sem ficheiros não há nada para anexar', () => {
    expect(ficheirosColados(clipboard([], 'olá'))).toEqual([]);
  });
});
