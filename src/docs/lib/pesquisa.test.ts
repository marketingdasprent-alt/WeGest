import { describe, expect, it } from 'vitest';
import { PAGINAS } from './navegacao';
import { SUGESTOES, construirIndice, pesquisar } from './pesquisa';

const indice = construirIndice();

describe('índice de pesquisa', () => {
  it('tem guias, endpoints, erros e campos', () => {
    const tipos = new Set(indice.map((e) => e.tipo));
    expect([...tipos].sort()).toEqual(['Campos', 'Endpoints', 'Erros', 'Guias']);
  });

  it('todo o destino aponta para uma página que existe', () => {
    const slugs = new Set(PAGINAS.map((p) => p.slug));
    for (const e of indice) expect(slugs.has(e.destino.split('#')[0]), e.destino).toBe(true);
    for (const s of SUGESTOES) expect(slugs.has(s), s).toBe(true);
  });

  it('endpoints levam à âncora da operação', () => {
    const r = pesquisar(indice, 'GET /v1/modelos/{id}');
    expect(r[0].tipo).toBe('Endpoints');
    expect(r[0].entradas[0].destino).toBe('recursos/modelos#obter');
  });

  it('ignora acentos e maiúsculas, e junta termos', () => {
    expect(pesquisar(indice, 'AUTENTICACAO')[0].entradas[0].destino).toBe('autenticacao');
    const limite = pesquisar(indice, 'limite 429');
    expect(limite.find((g) => g.tipo === 'Erros')?.entradas[0].titulo).toBe('LIMITE_EXCEDIDO');
  });

  it('campos do objecto aparecem com o esquema', () => {
    const campos = pesquisar(indice, 'bagageira').find((g) => g.tipo === 'Campos');
    expect(campos?.entradas[0]).toMatchObject({ contexto: 'Modelo · inteiro' });
  });

  it('termo vazio ou sem resultados dá lista vazia', () => {
    expect(pesquisar(indice, '   ')).toEqual([]);
    expect(pesquisar(indice, 'zzzzqqq')).toEqual([]);
  });
});
