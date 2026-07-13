import { describe, it, expect } from 'vitest';
import { buildCargoPermissoesRows } from './cargoPermissoesRows';
import type { Permission } from './PermissionsSelector';

const CARGO = 'cargo-1';

const perm = (recurso_id: string, tem_acesso: boolean, pode_editar: boolean): Permission => ({
  recurso_id,
  tem_acesso,
  pode_editar,
});

describe('buildCargoPermissoesRows', () => {
  it('só inclui permissões com tem_acesso', () => {
    const rows = buildCargoPermissoesRows(
      [perm('r1', true, false), perm('r2', false, false), perm('r3', true, true)],
      CARGO
    );
    expect(rows.map((r) => r.recurso_id)).toEqual(['r1', 'r3']);
  });

  it('preserva pode_editar e associa o cargo', () => {
    const rows = buildCargoPermissoesRows([perm('r1', true, true)], CARGO);
    expect(rows[0]).toMatchObject({
      cargo_id: CARGO,
      recurso_id: 'r1',
      tem_acesso: true,
      pode_editar: true,
    });
  });

  it('não envia colunas que não existem na BD (regressão PGRST204 pode_ver)', () => {
    // cargo_permissoes só tem tem_acesso/pode_editar; uma coluna extra
    // (ex.: pode_ver) faz o PostgREST rejeitar o insert inteiro.
    const rows = buildCargoPermissoesRows([perm('r1', true, false)], CARGO);
    expect(Object.keys(rows[0]).sort()).toEqual([
      'cargo_id',
      'pode_editar',
      'recurso_id',
      'tem_acesso',
    ]);
  });

  it('lista vazia ou tudo sem acesso → sem linhas', () => {
    expect(buildCargoPermissoesRows([], CARGO)).toEqual([]);
    expect(buildCargoPermissoesRows([perm('r1', false, true)], CARGO)).toEqual([]);
  });

  it('deduplica por recurso_id — a última ganha (evita duplicate key)', () => {
    const rows = buildCargoPermissoesRows(
      [perm('r1', true, false), perm('r1', true, true), perm('r2', true, false)],
      CARGO
    );
    expect(rows).toHaveLength(2);
    const r1 = rows.find((r) => r.recurso_id === 'r1');
    expect(r1?.pode_editar).toBe(true); // a última entrada de r1 prevalece
  });
});
