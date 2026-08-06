import { describe, expect, it } from 'vitest';
import { legendaFoto } from './render-anexo-danos';

describe('legendaFoto', () => {
  // O que motivou a mudança: a legenda dizia de ONDE a foto veio, nunca o que
  // ela mostra. Quem escreveu a descrição no fecho quer vê-la no papel.
  it('a descrição manda sobre a origem', () => {
    expect(
      legendaFoto({
        url: 'x',
        origem: 'Nesta recolha/entrega',
        descricao: 'Risco no para-choques traseiro',
      })
    ).toBe('Risco no para-choques traseiro');
  });

  it('sem descrição mantém a origem — comportamento de sempre', () => {
    expect(legendaFoto({ url: 'x', origem: 'Contrato #720' })).toBe('Contrato #720');
  });

  it('descrição só com espaços não conta como descrição', () => {
    expect(legendaFoto({ url: 'x', origem: 'Registo manual', descricao: '   ' })).toBe(
      'Registo manual'
    );
  });

  it('sem nada devolve o travessão em vez de string vazia', () => {
    expect(legendaFoto({ url: 'x' })).toBe('—');
  });

  // No papel um vídeo não se distingue de uma foto: sem o prefixo, ficava uma
  // moldura vazia sem explicação nenhuma.
  it('vídeo leva prefixo, com ou sem descrição', () => {
    expect(legendaFoto({ url: 'x', descricao: 'Volta ao carro', video: true })).toBe(
      '[Vídeo] Volta ao carro'
    );
    expect(legendaFoto({ url: 'x', origem: 'Nesta recolha/entrega', video: true })).toBe(
      '[Vídeo] Nesta recolha/entrega'
    );
  });
});
