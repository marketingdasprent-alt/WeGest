import { describe, it, expect } from 'vitest';

import {
  agruparSemDono,
  avisoImportacaoSemTitular,
  numeroCartaoDaTransacao,
  type TransacaoSemDono,
} from './combustivelSemDono';

const tx = (over: Partial<TransacaoSemDono>): TransacaoSemDono => ({
  fonte: 'edp',
  valor: 10,
  cardNumber: null,
  transactionId: 'x',
  ...over,
});

describe('numeroCartaoDaTransacao', () => {
  it('usa o número gravado quando existe', () => {
    expect(numeroCartaoDaTransacao(tx({ cardNumber: '9724998589690511' }))).toBe(
      '9724998589690511'
    );
  });

  it('EDP sem card_number: tira o número do transaction_id (o caso de Setembro)', () => {
    expect(
      numeroCartaoDaTransacao(tx({ transactionId: 'edp-5000000000030258-20260831004404' }))
    ).toBe('5000000000030258');
  });

  it('BP: usa o "Nº cartão" do ficheiro, contando a parte inteira de "105,0"', () => {
    expect(numeroCartaoDaTransacao(tx({ fonte: 'bp', numeroNoFicheiro: '105,0' }))).toBe('105');
  });

  it('sem nada, devolve nulo', () => {
    expect(numeroCartaoDaTransacao(tx({}))).toBeNull();
  });
});

describe('agruparSemDono', () => {
  it('junta por fonte e cartão e ordena pelo valor', () => {
    const grupos = agruparSemDono([
      tx({ transactionId: 'edp-1-a', valor: 5 }),
      tx({ transactionId: 'edp-1-b', valor: 7 }),
      tx({ fonte: 'bp', numeroNoFicheiro: '121', valor: 50 }),
    ]);
    expect(grupos).toEqual([
      { fonte: 'bp', cartao: '121', transacoes: 1, valor: 50 },
      { fonte: 'edp', cartao: '1', transacoes: 2, valor: 12 },
    ]);
  });

  it('linhas a 0 € (lixo do ficheiro) não contam', () => {
    expect(agruparSemDono([tx({ valor: 0, cardNumber: '1' })])).toEqual([]);
  });
});

describe('avisoImportacaoSemTitular', () => {
  it('diz quantos ficaram sem dono e onde se resolve', () => {
    expect(avisoImportacaoSemTitular(3)).toContain('3 abastecimentos ficaram sem motorista');
    expect(avisoImportacaoSemTitular(1)).toContain('1 abastecimento ficou');
  });

  it('nada a dizer quando tudo ficou com dono ou o importador não informa', () => {
    expect(avisoImportacaoSemTitular(0)).toBeNull();
    expect(avisoImportacaoSemTitular(undefined)).toBeNull();
  });
});
