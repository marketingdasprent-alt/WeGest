import { describe, expect, it } from 'vitest';
import { baseDocs, ehDominioDocs, hrefDocs, slugDoCaminho } from './base';
import { CHAVE_LINGUAGEM, guardarLinguagem, lerLinguagem } from './preferencias';

describe('base dos links da documentação', () => {
  it('em docs.wegest.pt as páginas vivem na raiz; na app em /docs', () => {
    expect(ehDominioDocs('docs.wegest.pt')).toBe(true);
    expect(ehDominioDocs('wegest.pt')).toBe(false);
    expect(baseDocs('docs.wegest.pt')).toBe('');
    expect(baseDocs('localhost')).toBe('/docs');
  });

  it('hrefDocs junta base, slug e âncora sem barras a mais', () => {
    expect(hrefDocs('', '')).toBe('/');
    expect(hrefDocs('/docs', '')).toBe('/docs');
    expect(hrefDocs('', 'erros#LIMITE_EXCEDIDO')).toBe('/erros#LIMITE_EXCEDIDO');
    expect(hrefDocs('/docs', 'recursos/modelos#obter')).toBe('/docs/recursos/modelos#obter');
  });

  it('slugDoCaminho tira a base e as barras', () => {
    expect(slugDoCaminho('/docs', '/docs/recursos/modelos/')).toBe('recursos/modelos');
    expect(slugDoCaminho('/docs', '/docs')).toBe('');
    expect(slugDoCaminho('', '/inicio-rapido')).toBe('inicio-rapido');
  });
});

describe('linguagem preferida', () => {
  it('lê o valor guardado e cai para cURL quando não há ou é inválido', () => {
    expect(lerLinguagem({ getItem: () => 'php' })).toBe('php');
    expect(lerLinguagem({ getItem: () => 'cobol' })).toBe('curl');
    expect(lerLinguagem({ getItem: () => null })).toBe('curl');
    expect(lerLinguagem(undefined)).toBe('curl');
  });

  it('armazenamento bloqueado nunca rebenta', () => {
    const bloqueado = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(lerLinguagem(bloqueado)).toBe('curl');
    expect(() => guardarLinguagem(bloqueado, 'php')).not.toThrow();
  });

  it('guarda com a chave combinada', () => {
    const guardado: Record<string, string> = {};
    guardarLinguagem({ setItem: (k, v) => (guardado[k] = v) }, 'javascript');
    expect(guardado).toEqual({ [CHAVE_LINGUAGEM]: 'javascript' });
  });
});
