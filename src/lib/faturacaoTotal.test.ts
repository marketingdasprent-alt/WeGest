import { describe, it, expect } from 'vitest';
// TS puro, sem APIs de Deno: a edge function faturacao-emitir usa o mesmo ficheiro.
import {
  avisoTotalDivergente,
  precoParaProvider,
  totalComIva,
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
