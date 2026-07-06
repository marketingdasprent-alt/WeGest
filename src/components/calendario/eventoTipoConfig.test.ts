import { describe, it, expect } from 'vitest';

import {
  TIPO_LABELS,
  TIPO_BORDER_COLORS,
  TIPO_ACCENT_COLORS,
  TIPO_TITLE_COLORS,
} from './eventoTipoConfig';

/**
 * Estes 4 mapas eram duplicados/divergentes entre EventoCard e
 * EventoHistoricoDialog antes de serem extraídos para este ficheiro
 * partilhado (2026-07-06). O risco agora é divergirem de novo — um tipo
 * novo adicionado a um mapa e esquecido nos outros 3 fica com fallback
 * silencioso (cor errada ou label = o próprio valor bruto). Este teste
 * fixa que os 4 mapas cobrem exactamente o mesmo conjunto de tipos.
 */
describe('eventoTipoConfig', () => {
  const mapas = {
    TIPO_LABELS,
    TIPO_BORDER_COLORS,
    TIPO_ACCENT_COLORS,
    TIPO_TITLE_COLORS,
  };

  it('os 4 mapas têm exactamente as mesmas chaves', () => {
    const chavesBase = Object.keys(TIPO_LABELS).sort();
    for (const [nome, mapa] of Object.entries(mapas)) {
      expect(Object.keys(mapa).sort(), `${nome} deve ter as mesmas chaves que TIPO_LABELS`).toEqual(
        chavesBase
      );
    }
  });

  it('cobre os tipos accionáveis conhecidos (entrega/recolha/troca)', () => {
    for (const tipo of ['entrega', 'recolha', 'troca', 'devolucao']) {
      expect(TIPO_LABELS[tipo]).toBeTruthy();
      expect(TIPO_BORDER_COLORS[tipo]).toBeTruthy();
      expect(TIPO_ACCENT_COLORS[tipo]).toBeTruthy();
      expect(TIPO_TITLE_COLORS[tipo]).toBeTruthy();
    }
  });

  it('nenhum valor está vazio ou é apenas espaços', () => {
    for (const mapa of Object.values(mapas)) {
      for (const [tipo, valor] of Object.entries(mapa)) {
        expect(valor.trim(), `valor de "${tipo}" não deve estar vazio`).not.toBe('');
      }
    }
  });

  it('TIPO_BORDER_COLORS e TIPO_ACCENT_COLORS usam a mesma cor base por tipo', () => {
    // ex: troca → border-l-purple-500 (border) e border-purple-500 (accent)
    for (const [tipo, border] of Object.entries(TIPO_BORDER_COLORS)) {
      const cor = border.replace('border-l-', '');
      expect(TIPO_ACCENT_COLORS[tipo], `accent de "${tipo}" deve usar a cor "${cor}"`).toContain(
        cor
      );
    }
  });
});
