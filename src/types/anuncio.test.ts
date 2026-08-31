import { describe, it, expect } from 'vitest';
import { formatarDataPt, formatarRotuloAnuncio } from './anuncio';

describe('formatarDataPt', () => {
  it('converte AAAA-MM-DD para DD/MM/AAAA', () => {
    expect(formatarDataPt('2026-09-01')).toBe('01/09/2026');
  });
});

describe('formatarRotuloAnuncio', () => {
  it('junta cliente, preço e período num único rótulo', () => {
    const rotulo = formatarRotuloAnuncio({
      id: 'a1',
      cliente_nome: 'Empresa X',
      preco: 50,
      data_inicio: '2026-09-01',
      data_fim: '2026-09-30',
    });

    expect(rotulo).toBe('Empresa X — 50,00 € — 01/09/2026 a 30/09/2026');
  });

  // Preço com cêntimos é onde um formatador ingénuo costuma falhar.
  it('mostra sempre os dois cêntimos, mesmo quando o preço é inteiro', () => {
    const rotulo = formatarRotuloAnuncio({
      id: 'a2',
      cliente_nome: 'Empresa Y',
      preco: 224.9,
      data_inicio: '2026-01-01',
      data_fim: '2026-01-31',
    });

    expect(rotulo).toContain('224,90 €');
  });
});
