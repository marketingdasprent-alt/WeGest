import { describe, it, expect } from 'vitest';
// TS puro, sem APIs de Deno: a edge function faturacao-emitir usa o mesmo ficheiro.
import {
  avisoTotalDivergente,
  precoParaProvider,
  toleranciaTotal,
  totalComIva,
  totalEsperado,
} from '../../supabase/functions/_shared/faturacao/totais';

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
});

describe('totalEsperado e toleranciaTotal', () => {
  const it1 = (quantidade: number, preco_unitario: number, taxa_iva = 23, desconto?: number) => ({
    quantidade,
    preco_unitario,
    taxa_iva,
    desconto,
  });

  it('Qty 30 a 0,50 € + 23 %: 18,45 sem preços com IVA, 18,60 com (0,62 x 30), dentro da tolerância', () => {
    const itens = [it1(30, 0.5)];
    expect(totalEsperado(itens, false)).toBe(18.45);
    expect(totalEsperado(itens, true)).toBe(18.6);
    expect(toleranciaTotal(itens)).toBeCloseTo(0.16, 10);
    expect(Math.abs(18.6 - 18.45)).toBeLessThanOrEqual(toleranciaTotal(itens));
  });

  it('IVA misto 0/6/23 %', () => {
    const itens = [it1(1, 100, 0), it1(1, 100, 6), it1(1, 100, 23)];
    expect(totalEsperado(itens, false)).toBe(329);
    expect(totalEsperado(itens, true)).toBe(329);
  });

  it('desconto por linha', () => {
    expect(totalEsperado([it1(2, 50, 23, 10)], false)).toBe(110.7);
    expect(totalEsperado([it1(2, 50, 23, 10)], true)).toBe(110.7);
  });

  it('linhas negativas somam-se e a tolerância usa o módulo da quantidade', () => {
    const itens = [it1(1, 100), it1(-1, 40)];
    expect(totalEsperado(itens, false)).toBe(73.8);
    expect(toleranciaTotal(itens)).toBeCloseTo(0.05, 10);
    expect(toleranciaTotal([it1(-30, 1)])).toBeCloseTo(0.16, 10);
  });

  it('quantidade 0 ou ausente é enviada como 1 ao fornecedor', () => {
    expect(totalEsperado([it1(0, 100)], false)).toBe(123);
    expect(totalEsperado([{ preco_unitario: 100, taxa_iva: 23 } as never], true)).toBe(123);
    expect(toleranciaTotal([it1(0, 100)])).toBeCloseTo(0.05, 10);
  });

  it('sem linhas: total 0 e tolerância mínima', () => {
    expect(totalEsperado([], false)).toBe(0);
    expect(toleranciaTotal([])).toBe(0.05);
  });
});
