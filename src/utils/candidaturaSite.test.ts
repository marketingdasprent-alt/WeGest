import { describe, expect, it } from 'vitest';
import {
  detalhesCandidaturaSite,
  idFichaAprovada,
  type CandidaturaSiteCampos,
} from './candidaturaSite';

const site = (extra: Partial<CandidaturaSiteCampos> = {}): CandidaturaSiteCampos => ({
  origem: 'site',
  em_formacao_tvde: false,
  data_inicio_pretendida: null,
  modelo_pretendido: null,
  ...extra,
});

describe('detalhesCandidaturaSite', () => {
  it('candidatura do portal não mostra nada, mesmo com campos preenchidos', () => {
    expect(
      detalhesCandidaturaSite(
        site({
          origem: 'portal',
          em_formacao_tvde: true,
          data_inicio_pretendida: '2026-10-20',
          modelo_pretendido: { nome: 'Corolla', marca: { nome: 'Toyota' } },
        })
      )
    ).toEqual([]);
  });

  it('candidatura do site sem escolhas não mostra linhas', () => {
    expect(detalhesCandidaturaSite(site())).toEqual([]);
  });

  it('modelo pretendido com a marca à frente', () => {
    expect(
      detalhesCandidaturaSite(
        site({ modelo_pretendido: { nome: 'Corolla', marca: { nome: 'Toyota' } } })
      )
    ).toEqual([{ rotulo: 'Modelo pretendido', valor: 'Toyota Corolla' }]);
  });

  it('modelo sem marca mostra só o nome', () => {
    expect(
      detalhesCandidaturaSite(site({ modelo_pretendido: { nome: 'Corolla', marca: null } }))
    ).toEqual([{ rotulo: 'Modelo pretendido', valor: 'Corolla' }]);
  });

  it('data de início em dd/mm/aaaa', () => {
    expect(detalhesCandidaturaSite(site({ data_inicio_pretendida: '2026-10-20' }))).toEqual([
      { rotulo: 'Início pretendido', valor: '20/10/2026' },
    ]);
  });

  it('em formação TVDE', () => {
    expect(detalhesCandidaturaSite(site({ em_formacao_tvde: true }))).toEqual([
      { rotulo: 'Licença TVDE', valor: 'em formação' },
    ]);
  });

  it('as três linhas, por esta ordem', () => {
    expect(
      detalhesCandidaturaSite(
        site({
          em_formacao_tvde: true,
          data_inicio_pretendida: '2026-10-20',
          modelo_pretendido: { nome: 'Corolla', marca: { nome: 'Toyota' } },
        })
      ).map((l) => l.rotulo)
    ).toEqual(['Modelo pretendido', 'Início pretendido', 'Licença TVDE']);
  });
});

describe('idFichaAprovada', () => {
  it('devolve o motorista_id da RPC, criado ou associado', () => {
    expect(idFichaAprovada({ motorista_id: 'm1', accao: 'criado' })).toBe('m1');
    expect(idFichaAprovada({ motorista_id: 'm2', accao: 'associado' })).toBe('m2');
  });

  it('sem motorista_id devolve null (nunca procura pelo user_id, que no site é nulo)', () => {
    expect(idFichaAprovada(null)).toBeNull();
    expect(idFichaAprovada({ accao: 'criado' })).toBeNull();
    expect(idFichaAprovada({ motorista_id: '' })).toBeNull();
    expect(idFichaAprovada({ motorista_id: 42 })).toBeNull();
  });
});
