import { describe, expect, it } from 'vitest';
import { RECURSOS } from './navegacao';
import {
  SERVIDOR,
  URL_OPENAPI,
  errosDaOperacao,
  esquemaComponente,
  operacao,
  resumoDaResposta,
} from './spec';

const sucesso = (id: string) => {
  const r = operacao(id).respostas.find((x) => x.estado === '200');
  if (!r) throw new Error(`${id} sem 200`);
  return r;
};

describe('spec da documentação', () => {
  it('servidor e OpenAPI em api.wegest.pt/v1', () => {
    expect(SERVIDOR).toBe('https://api.wegest.pt/v1');
    expect(URL_OPENAPI).toBe('https://api.wegest.pt/v1/openapi.json');
  });

  it('resumoDaResposta: lista, objecto nomeado e esquema em linha', () => {
    expect(resumoDaResposta(sucesso('GET /modelos'))).toMatchObject({
      rotulo: 'Lista de Modelo',
      ref: 'Modelo',
    });
    expect(resumoDaResposta(sucesso('GET /modelos/{id}'))).toMatchObject({
      rotulo: 'ModeloDetalhe',
      ref: 'ModeloDetalhe',
    });
    const health = resumoDaResposta(sucesso('GET /health'));
    expect(health.ref).toBeUndefined();
    expect(health.rotulo).toBe('A chave é válida');
    expect(Object.keys(health.esquema?.properties as object)).toContain('tarifa_site');
  });

  it('errosDaOperacao: só 4xx/5xx com código, nunca o 200', () => {
    const erros = errosDaOperacao(operacao('GET /modelos/{id}'));
    expect(erros.map((e) => e.estado)).toContain('404');
    expect(erros.every((e) => !e.estado.startsWith('2') && e.codigo)).toBe(true);
  });

  it('cada recurso: operações existem e o objecto tem exemplo (coluna de código)', () => {
    for (const r of RECURSOS) {
      for (const o of r.operacoes) expect(() => operacao(o.id), o.id).not.toThrow();
      if (r.objecto) expect(esquemaComponente(r.objecto).example, r.objecto).toBeDefined();
    }
  });
});
