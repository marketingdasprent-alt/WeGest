import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('privilégios dos resolvers de cartões', () => {
  it('retira execução direta a authenticated e preserva o trigger interno', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260910163600_fechar_resolvers_cartao_security_definer.sql'
      ),
      'utf8'
    ).toLowerCase();

    expect(sql).toContain('alter function public.tg_resolver_motorista_cartao() security definer');
    expect(sql).toMatch(
      /revoke all on function public\.resolver_titular_por_cartao\([^)]+\)\s+from public, anon, authenticated/
    );
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});

describe('autenticação dos crons de Edge Functions', () => {
  it('aborta sem service role e elimina o fallback para a anon key', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260910163628_exigir_service_role_nos_crons_edge.sql'
      ),
      'utf8'
    ).toLowerCase();

    expect(sql).toContain("segredo.name = 'cron_service_role_jwt'");
    expect(sql).toContain('migração abortada sem alterações');
    expect(sql).not.toContain("segredo.name = 'cron_edge_jwt'");
    expect(sql).toMatch(
      /revoke all on function public\.cron_invocar_edge\([^)]+\)\s+from public, anon, authenticated/
    );
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});

describe('credenciais das funções SQL que chamam Edge Functions', () => {
  it('troca bearers legados pela service role do Vault sem guardar JWT no SQL novo', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260910163658_remover_anon_jwt_funcoes_database.sql'
      ),
      'utf8'
    ).toLowerCase();

    expect(sql).toContain('edge_internal_authorization_header');
    expect(sql).toContain('emit_lembretes_cobranca_atrasada');
    expect(sql).toContain('fn_cartao_frota_email_aviso');
    expect(sql).toContain('fn_contratos_renting_criado_domain_event');
    expect(sql).not.toMatch(/eyj[a-z0-9_-]{20,}\./i);
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});

describe('view de atraso das fontes', () => {
  it('executa como invoker para respeitar RLS das tabelas de origem', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260910165308_v_atraso_fontes_security_invoker.sql'
      ),
      'utf8'
    ).toLowerCase();

    expect(sql).toContain('alter view public.v_atraso_das_fontes set (security_invoker = true)');
    expect(sql).toContain('revoke all on table public.v_atraso_das_fontes from anon');
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});

describe('segredos das integrações robot', () => {
  it('remove tokens copiados e impede que voltem a ser persistidos por organização', () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20260911090102_proteger_segredos_integracoes_robot.sql'
      ),
      'utf8'
    ).toLowerCase();

    expect(sql).toContain('update public.plataformas_configuracao');
    expect(sql).toContain('set apify_api_token = null');
    expect(sql).toContain('new.apify_api_token := null');
    expect(sql).toMatch(
      /revoke all on table public\.apify_credenciais_partilhadas from anon, authenticated/
    );
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});
