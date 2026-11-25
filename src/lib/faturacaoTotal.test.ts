import { describe, it, expect } from 'vitest';
// TS puro, sem APIs de Deno: a edge function faturacao-emitir usa o mesmo ficheiro.
import {
  avisoTotalDivergente,
  precoParaProvider,
  totalComIva,
  totalEsperado,
} from '../../supabase/functions/_shared/faturacao/totais';

// FT 4 67/171 (25-11-2026): 31 portagens com IVA incluído, lançadas na Nova Fatura
// pelo preço sem IVA arredondado a cêntimos. A KeyInvoice da Sul emitiu 56,00 €, certo.
const PORTAGENS_4_67_171 = [
  ...Array.from({ length: 11 }, () => ({ quantidade: 1, preco_unitario: 0.53, taxa_iva: 23 })),
  ...Array.from({ length: 15 }, () => ({ quantidade: 1, preco_unitario: 1.19, taxa_iva: 23 })),
  ...Array.from({ length: 4 }, () => ({ quantidade: 1, preco_unitario: 3.94, taxa_iva: 23 })),
  { quantidade: 1, preco_unitario: 6.14, taxa_iva: 23 },
];

describe('precoParaProvider', () => {
  it('conta normal recebe o preço sem IVA, tal como está', () => {
    expect(precoParaProvider(1115, 23, false)).toBe(1115);
  });

  // A conta da Sul tira o IVA de dentro: 1371,45 / 1,23 = 1115 + 256,45 de IVA.
  it('conta com IVA incluído recebe o preço já com IVA', () => {
    expect(precoParaProvider(1115, 23, true)).toBe(1371.45);
    expect(precoParaProvider(1118.45, 23, true)).toBe(1375.69);
  });

  it('a 0 % o preço não muda em nenhuma das contas', () => {
    expect(precoParaProvider(47.8, 0, true)).toBe(47.8);
  });
});

describe('totalComIva', () => {
  it('soma o IVA por cima do preço sem IVA', () => {
    expect(totalComIva([{ quantidade: 1, preco_unitario: 1115, taxa_iva: 23 }])).toBeCloseTo(
      1371.45,
      2
    );
  });

  it('aplica o desconto antes do IVA e soma várias linhas', () => {
    const total = totalComIva([
      { quantidade: 2, preco_unitario: 100, taxa_iva: 23, desconto: 10 },
      { quantidade: 1, preco_unitario: 50, taxa_iva: 0 },
    ]);
    expect(total).toBeCloseTo(271.4, 2);
  });
});

describe('avisoTotalDivergente', () => {
  it('não avisa quando o provider não devolveu o total', () => {
    expect(avisoTotalDivergente(1371.45, null, '4 67/28')).toBeNull();
    expect(avisoTotalDivergente(1371.45, undefined, '4 67/28')).toBeNull();
  });

  it('tolera diferenças de arredondamento por linha', () => {
    expect(avisoTotalDivergente(152.89, 152.87, '4 67/4')).toBeNull();
  });

  // Caso real de 08-10-2026: a conta da Sul leu o preço sem IVA como IVA incluído.
  it('avisa quando o documento fiscal saiu com outro total', () => {
    const aviso = avisoTotalDivergente(1371.45, 1115, '4 67/28');
    expect(aviso).toContain('4 67/28');
    expect(aviso).toContain('1115.00');
    expect(aviso).toContain('1371.45');
    expect(aviso).toContain('IVA incluído');
  });

  it('não avisa na 4 67/171: o arredondamento de 31 linhas não é um documento errado', () => {
    const esperado = totalEsperado(PORTAGENS_4_67_171, true);
    expect(avisoTotalDivergente(esperado, 56, '4 67/171')).toBeNull();
  });

  // A margem continua fixa: uma portagem de 0,65 € em falta tem de ser apanhada.
  it('avisa quando falta uma só portagem', () => {
    const esperado = totalEsperado(PORTAGENS_4_67_171, true);
    expect(avisoTotalDivergente(esperado, 55.35, '4 67/171')).toContain('55.35');
  });
});

describe('totalEsperado', () => {
  it('com IVA incluído arredonda o preço com IVA por linha, como a KeyInvoice', () => {
    expect(totalComIva(PORTAGENS_4_67_171)).toBeCloseTo(56.06, 2);
    expect(totalEsperado(PORTAGENS_4_67_171, true)).toBe(56);
  });

  it('os dois modos arredondam em sítios diferentes', () => {
    const linha = [{ quantidade: 3, preco_unitario: 0.53, taxa_iva: 23 }];
    // Com IVA: 0,65 × 3. Sem IVA: base 1,59 + IVA 0,37.
    expect(totalEsperado(linha, true)).toBe(1.95);
    expect(totalEsperado(linha, false)).toBe(1.96);
  });

  it('com IVA incluído aplica o desconto ao preço já com IVA', () => {
    expect(
      totalEsperado([{ quantidade: 2, preco_unitario: 100, taxa_iva: 23, desconto: 10 }], true)
    ).toBe(221.4);
  });

  it('aplica o desconto e trata a quantidade em falta como 1', () => {
    expect(
      totalEsperado(
        [
          { quantidade: 2, preco_unitario: 100, taxa_iva: 23, desconto: 10 },
          { quantidade: 0, preco_unitario: 50, taxa_iva: 0 },
        ],
        false
      )
    ).toBe(271.4);
  });
});
