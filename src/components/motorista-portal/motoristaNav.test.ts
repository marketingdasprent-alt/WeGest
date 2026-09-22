import { describe, it, expect } from 'vitest';
import { MOTORISTA_TABS, tabActivo, tabDoParametro, urlDoTab } from './motoristaNav';

describe('motoristaNav', () => {
  it('tem quatro secções com ids únicos', () => {
    const ids = MOTORISTA_TABS.map((t) => t.id);
    expect(ids).toEqual(['inicio', 'viatura', 'contas', 'documentos']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('tabDoParametro', () => {
    it('aceita uma secção válida', () => {
      expect(tabDoParametro('contas')).toBe('contas');
    });

    it('cai no Início com valor inválido, vazio ou em falta', () => {
      // Um link antigo ou um `?tab=` inventado nunca deixa o painel em branco.
      expect(tabDoParametro('dashboard')).toBe('inicio');
      expect(tabDoParametro('')).toBe('inicio');
      expect(tabDoParametro(null)).toBe('inicio');
      expect(tabDoParametro(undefined)).toBe('inicio');
    });
  });

  describe('tabActivo', () => {
    it('lê o ?tab= do painel', () => {
      expect(tabActivo('/motorista/painel', '?tab=viatura')).toBe('viatura');
    });

    it('sem parâmetro é o Início', () => {
      expect(tabActivo('/motorista/painel', '')).toBe('inicio');
    });

    it('o detalhe de um acordo pertence a Contas', () => {
      // A sidebar não acendia nada quando o motorista abria um acordo.
      expect(tabActivo('/motorista/painel/acordos/abc-123', '')).toBe('contas');
    });
  });

  describe('urlDoTab', () => {
    it('o Início é o painel sem parâmetros — bate certo com o start_url do PWA', () => {
      expect(urlDoTab('inicio')).toBe('/motorista/painel');
    });

    it('as outras levam ?tab=', () => {
      expect(urlDoTab('documentos')).toBe('/motorista/painel?tab=documentos');
    });

    it('ida e volta: tabActivo(urlDoTab(x)) === x', () => {
      for (const t of MOTORISTA_TABS) {
        const url = new URL(urlDoTab(t.id), 'http://x');
        expect(tabActivo(url.pathname, url.search)).toBe(t.id);
      }
    });
  });
});
