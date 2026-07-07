import { describe, it, expect } from 'vitest';

import { gruposComViatura, filtrarViaturasPorGrupo } from './filtrarViaturasPorGrupo';

const grupoA = { id: 'g-a', nome: 'Económico' };
const grupoB = { id: 'g-b', nome: 'Familiar Premium' };
const grupoC = { id: 'g-c', nome: 'Sem viaturas' };

const viaturas = [
  { id: 'v1', grupo_id: 'g-a' },
  { id: 'v2', grupo_id: 'g-a' },
  { id: 'v3', grupo_id: 'g-b' },
  { id: 'v4', grupo_id: null },
];

describe('gruposComViatura', () => {
  it('devolve só os grupos que têm pelo menos 1 viatura', () => {
    const result = gruposComViatura(viaturas, [grupoA, grupoB, grupoC]);
    expect(result).toEqual([grupoA, grupoB]);
  });

  it('devolve vazio quando nenhuma viatura tem grupo_id', () => {
    const semGrupo = [{ grupo_id: null }, { grupo_id: null }];
    expect(gruposComViatura(semGrupo, [grupoA, grupoB])).toEqual([]);
  });

  it('devolve vazio quando não há grupos', () => {
    expect(gruposComViatura(viaturas, [])).toEqual([]);
  });

  it('ignora viaturas com grupo_id que não corresponde a nenhum grupo conhecido', () => {
    const orfa = [{ grupo_id: 'grupo-inexistente' }];
    expect(gruposComViatura(orfa, [grupoA])).toEqual([]);
  });
});

describe('filtrarViaturasPorGrupo', () => {
  it('sem filtro (Set vazio) devolve todas as viaturas, incluindo sem grupo', () => {
    const result = filtrarViaturasPorGrupo(viaturas, new Set());
    expect(result).toEqual(viaturas);
  });

  it('filtra só as viaturas do(s) grupo(s) seleccionado(s)', () => {
    const result = filtrarViaturasPorGrupo(viaturas, new Set(['g-a']));
    expect(result.map((v) => v.id)).toEqual(['v1', 'v2']);
  });

  it('suporta múltiplos grupos seleccionados', () => {
    const result = filtrarViaturasPorGrupo(viaturas, new Set(['g-a', 'g-b']));
    expect(result.map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
  });

  it('exclui viatura sem grupo_id quando há filtro activo', () => {
    const result = filtrarViaturasPorGrupo(viaturas, new Set(['g-a', 'g-b']));
    expect(result.find((v) => v.id === 'v4')).toBeUndefined();
  });

  it('devolve vazio quando o grupo filtrado não tem correspondência', () => {
    const result = filtrarViaturasPorGrupo(viaturas, new Set(['grupo-inexistente']));
    expect(result).toEqual([]);
  });
});
