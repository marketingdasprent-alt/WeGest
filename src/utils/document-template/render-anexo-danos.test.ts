import { describe, expect, it } from 'vitest';
import { legendaFoto, rotuloNaoImagem } from './render-anexo-danos';

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

describe('legendaFoto — anexos que não são imagem', () => {
  it('PDF leva prefixo próprio', () => {
    expect(legendaFoto({ url: 'x', descricao: 'Peritagem da seguradora', pdf: true })).toBe(
      '[PDF] Peritagem da seguradora'
    );
  });

  it('PDF ganha ao vídeo quando ambos vêm marcados', () => {
    // Não deve acontecer, mas um ficheiro mal classificado não pode sair
    // rotulado como as duas coisas.
    expect(legendaFoto({ url: 'x', origem: 'Registo manual', pdf: true, video: true })).toBe(
      '[PDF] Registo manual'
    );
  });
});

describe('rotuloNaoImagem', () => {
  it('imagem normal não leva rótulo — desenha-se', () => {
    expect(rotuloNaoImagem({ url: 'x', descricao: 'Risco' })).toBeNull();
  });

  it('vídeo e PDF levam o seu rótulo', () => {
    expect(rotuloNaoImagem({ url: 'x', video: true })).toBe('VÍDEO');
    expect(rotuloNaoImagem({ url: 'x', pdf: true })).toBe('PDF');
  });
});
