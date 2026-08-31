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

  it('um débito de categoria desconhecida fica fora do detalhe — não há coluna genérica de débito', () => {
    expect(colunaDoMovimento('outro', 'debito')).toBeUndefined();
  });

  it('sem categoria nenhuma, a mesma regra do crédito/débito aplica-se', () => {
    expect(colunaDoMovimento(null, 'credito')).toBe('outrasDevolucoes');
    expect(colunaDoMovimento(undefined, 'debito')).toBeUndefined();
    expect(colunaDoMovimento('', 'credito')).toBe('outrasDevolucoes');
  });
});
