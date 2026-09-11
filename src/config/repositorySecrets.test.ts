import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const jwtPattern = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/;

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe('segredos no repositório ativo', () => {
  it('não contém JWTs hardcoded em código executável ou scripts auxiliares', () => {
    const roots = ['src', 'scratch', 'tmp', 'supabase/functions'].map((path) =>
      resolve(process.cwd(), path)
    );
    const offenders = roots
      .flatMap(filesUnder)
      .filter((path) => ['.js', '.mjs', '.ts', '.tsx'].includes(extname(path)))
      .filter((path) => jwtPattern.test(readFileSync(path, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('não introduz novos JWTs SQL e compensa os três legados da baseline', () => {
    const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
    const migrations = filesUnder(migrationsDir).filter((path) => extname(path) === '.sql');
    const baseline = migrations.find((path) => path.endsWith('00000000000000_baseline.sql'))!;
    const forward = migrations.find((path) =>
      path.endsWith('20260910163658_remover_anon_jwt_funcoes_database.sql')
    )!;

    const newOffenders = migrations
      .filter((path) => path !== baseline)
      .filter((path) => jwtPattern.test(readFileSync(path, 'utf8')));
    expect(newOffenders).toEqual([]);

    const legacyMatches = readFileSync(baseline, 'utf8').match(new RegExp(jwtPattern, 'g')) ?? [];
    expect(legacyMatches).toHaveLength(3);
    const remediation = readFileSync(forward, 'utf8');
    expect(remediation).toContain('emit_lembretes_cobranca_atrasada');
    expect(remediation).toContain('fn_cartao_frota_email_aviso');
    expect(remediation).toContain('fn_contratos_renting_criado_domain_event');
  });
});
