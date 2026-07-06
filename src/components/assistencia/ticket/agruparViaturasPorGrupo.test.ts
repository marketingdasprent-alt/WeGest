import { describe, it, expect } from 'vitest';
import { agruparViaturasPorGrupo, type ViaturaComGrupo } from './agruparViaturasPorGrupo';

/**
 * Fluxo de avaria→substituta hoje não distingue grupo tarifário — o gestor
 * podia atribuir qualquer viatura disponível, mesmo de grupo muito diferente
 * do da viatura avariada. Esta função separa a lista em "mesmo grupo"
 * (mostrado primeiro/sempre) e "outros grupos" (atrás de um toggle na UI),
 * sem nunca bloquear — grupo desconhecido/null cai em "outros grupos".
 */
describe('agruparViaturasPorGrupo', () => {
  const v = (id: string, grupoId: string | null): ViaturaComGrupo => ({
    id,
    matricula: `MAT-${id}`,
    marca: 'Marca',
    modelo: 'Modelo',
    grupoId,
    grupoNome: grupoId ? `Grupo ${grupoId}` : null,
  });

  it('separa viaturas do mesmo grupo da avariada', () => {
    const r = agruparViaturasPorGrupo([v('1', 'A'), v('2', 'B'), v('3', 'A')], 'A');
    expect(r.mesmoGrupo.map((x) => x.id)).toEqual(['1', '3']);
    expect(r.outrosGrupos.map((x) => x.id)).toEqual(['2']);
  });

  it('trata grupo null da viatura avariada como "sem correspondência" — tudo em outros grupos', () => {
    const r = agruparViaturasPorGrupo([v('1', 'A'), v('2', null)], null);
    expect(r.mesmoGrupo).toEqual([]);
    expect(r.outrosGrupos.map((x) => x.id)).toEqual(['1', '2']);
  });

  it('viatura candidata com grupo null vai para outros grupos mesmo se a avariada tiver grupo', () => {
    const r = agruparViaturasPorGrupo([v('1', null)], 'A');
    expect(r.mesmoGrupo).toEqual([]);
    expect(r.outrosGrupos.map((x) => x.id)).toEqual(['1']);
  });

  it('lista vazia devolve os dois baldes vazios', () => {
    const r = agruparViaturasPorGrupo([], 'A');
    expect(r.mesmoGrupo).toEqual([]);
    expect(r.outrosGrupos).toEqual([]);
  });

  it('todas do mesmo grupo — outrosGrupos vazio', () => {
    const r = agruparViaturasPorGrupo([v('1', 'A'), v('2', 'A')], 'A');
    expect(r.mesmoGrupo.map((x) => x.id)).toEqual(['1', '2']);
    expect(r.outrosGrupos).toEqual([]);
  });
});
