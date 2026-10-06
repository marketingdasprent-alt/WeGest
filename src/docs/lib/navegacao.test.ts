import { describe, expect, it } from 'vitest';
import {
  PAGINAS,
  RECURSOS,
  anteriorSeguinte,
  caminhosSemPagina,
  navegacao,
  pagina,
} from './navegacao';
import { operacoes } from './spec';

describe('navegação do docs', () => {
  it('todo o caminho do OpenAPI tem página (um caminho novo sem página falha aqui)', () => {
    expect(caminhosSemPagina()).toEqual([]);
  });

  it('toda a operação de recurso existe na spec, e toda a operação com chave tem recurso', () => {
    const ids = new Set(operacoes().map((o) => o.id));
    for (const r of RECURSOS) for (const o of r.operacoes) expect(ids.has(o.id), o.id).toBe(true);
    const comRecurso = new Set(RECURSOS.flatMap((r) => r.operacoes.map((o) => o.id)));
    for (const op of operacoes().filter((o) => !o.publica)) {
      expect(comRecurso.has(op.id), op.id).toBe(true);
    }
  });

  it('slugs únicos e os grupos pela ordem da spec', () => {
    const slugs = PAGINAS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(navegacao().map((g) => g.grupo)).toEqual([
      'Começar',
      'Conceitos',
      'Recursos',
      'Ferramentas',
    ]);
  });

  it('sem páginas "em breve", o grupo "Em breve" não aparece', () => {
    expect(PAGINAS.filter((p) => p.emBreve)).toEqual([]);
    expect(navegacao().find((g) => g.grupo === 'Em breve')).toBeUndefined();
  });

  it('disponibilidade, cotações e reservas são páginas de recurso, fora do "Em breve"', () => {
    for (const slug of ['recursos/disponibilidade', 'recursos/cotacoes', 'recursos/reservas']) {
      expect(pagina(slug)?.grupo, slug).toBe('Recursos');
      expect(pagina(slug)?.emBreve, slug).toBeUndefined();
    }
  });

  it('Anterior/Seguinte saltam o "em breve" e as ligações externas', () => {
    expect(anteriorSeguinte('').anterior).toBeUndefined();
    expect(anteriorSeguinte('').seguinte?.slug).toBe('inicio-rapido');
    expect(anteriorSeguinte('recursos/health').seguinte?.slug).toBe('referencia');
    expect(anteriorSeguinte('referencia').seguinte?.slug).toBe('alteracoes');
    expect(anteriorSeguinte('recursos/reservas').anterior?.slug).toBe('recursos/cotacoes');
    expect(anteriorSeguinte('recursos/reservas').seguinte?.slug).toBe('recursos/health');
  });

  it('a descarga do OpenAPI aponta para o servidor público', () => {
    expect(pagina('openapi.json')?.externo).toBe('https://api.wegest.pt/v1/openapi.json');
  });
});
