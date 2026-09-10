import { describe, it, expect } from 'vitest';
import { colunaDoMovimento } from './relatorioPagamentoCategorias';

describe('colunaDoMovimento', () => {
  it('categorias reconhecidas vão sempre para a sua coluna', () => {
    expect(colunaDoMovimento('rnvat', 'debito')).toBe('rnvat');
    expect(colunaDoMovimento('seguros', 'debito')).toBe('seguros');
    expect(colunaDoMovimento('acordo', 'debito')).toBe('acordos');
    expect(colunaDoMovimento('caucao', 'debito')).toBe('caucao');
    expect(colunaDoMovimento('negativo_anterior', 'debito')).toBe('negativoAnterior');
    expect(colunaDoMovimento('dev_caucao', 'credito')).toBe('devCaucao');
    expect(colunaDoMovimento('bonus', 'credito')).toBe('bonificacao');
    expect(colunaDoMovimento('ajuda_custo', 'credito')).toBe('ajudaCusto');
    expect(colunaDoMovimento('outras_devolucoes', 'credito')).toBe('outrasDevolucoes');
  });

  // O caso real: Pedro Martins e Paulo Silva (PREMIUM RIDE) tinham créditos
  // pendentes — 100 € e 75 €, categoria 'outro' — que nunca apareciam no
  // relatório porque essa categoria não estava na lista fixa.
  it('um crédito de categoria desconhecida cai em Outras Devoluções', () => {
    expect(colunaDoMovimento('outro', 'credito')).toBe('outrasDevolucoes');
  });

  // Semana 31/08–06/09: 941,25 € de slot_mensal, 623,52 € de desconto e
  // 295,43 € de 'outro' contavam no líquido e na coluna "Outros" dos Resumos
  // sem deixar rasto nenhum aqui — o detalhe por coluna nunca fechava com o
  // "Valor a Pagar".
  it('um débito de categoria desconhecida cai em Outros Débitos', () => {
    expect(colunaDoMovimento('outro', 'debito')).toBe('outrosDebitos');
    expect(colunaDoMovimento('slot_mensal', 'debito')).toBe('outrosDebitos');
    expect(colunaDoMovimento('desconto', 'debito')).toBe('outrosDebitos');
  });

  it('sem categoria nenhuma, a mesma regra do crédito/débito aplica-se', () => {
    expect(colunaDoMovimento(null, 'credito')).toBe('outrasDevolucoes');
    expect(colunaDoMovimento(undefined, 'debito')).toBe('outrosDebitos');
    expect(colunaDoMovimento('', 'credito')).toBe('outrasDevolucoes');
  });

  // O trigger sincronizar_movimento_resumo escreve o líquido da semana como
  // movimento de categoria 'resumos'. Ele É o "Valor a Pagar" — pô-lo também
  // numa coluna de detalhe contava-o duas vezes. Na semana 31/08–06/09 eram
  // 85.846,80 € a inchar "Outras Devoluções", contra 255,24 € de movimentos
  // que aterravam na coluna certa.
  it('o movimento escrito pelo próprio resumo não entra no detalhe', () => {
    expect(colunaDoMovimento('resumos', 'credito')).toBeUndefined();
    expect(colunaDoMovimento('resumos', 'debito')).toBeUndefined();
  });

  // O aluguer tem coluna própria (Viatura), vinda do cálculo dias × tarifa.
  it('a renda da viatura não entra no detalhe — a coluna Viatura já a traz', () => {
    expect(colunaDoMovimento('renda_viatura', 'debito')).toBeUndefined();
    expect(colunaDoMovimento('renda_viatura', 'credito')).toBeUndefined();
  });

  it('não se importa com maiúsculas nem espaços', () => {
    expect(colunaDoMovimento(' Resumos ', 'credito')).toBeUndefined();
    expect(colunaDoMovimento('AJUDA_CUSTO', ' Credito ')).toBe('ajudaCusto');
  });
});
