import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const ids = Object.fromEntries(
  [
    'orgA',
    'orgB',
    'adminA',
    'adminB',
    'readerA',
    'editorA',
    'cargoA',
    'resource',
    'tarifaA',
    'tarifaB',
    'tarifaA2',
    'modeloA',
    'modeloB',
    'motoristaA',
    'motoristaB',
    'motoristaCache',
    'clienteB',
    'recorrenciaA',
    'recorrenciaB',
    'viaVerdeA',
    'viaVerdeB',
    'boltA',
  ].map((name, index) => [name, `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`])
);

const tableNames = [
  'user_org_ativa',
  'user_organizacoes',
  'cargo_permissoes',
  'recursos',
  'renting_tarifas',
  'renting_tarifa_precos_modelo',
  'viatura_modelos',
  'motoristas_ativos',
  'clientes',
  'motorista_financeiro',
  'motorista_financeiro_recorrencias',
  'via_verde_sync_queue',
  'reservas',
  'contrato_cobrancas',
  'plataformas_configuracao',
];
const rpcNames = [
  'fn_ensure_cliente_condutor',
  'gerar_movimentos_recorrentes',
  'gerar_seguros_semanais',
  'via_verde_sync_queue_claim',
];

export async function createFixture() {
  const modulePath = process.env.WEGEST_PGLITE_MODULE;
  const { PGlite } = await import(
    modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite'
  );
  const { btree_gist } = await import(
    modulePath
      ? new URL('./contrib/btree_gist.js', pathToFileURL(modulePath)).href
      : '@electric-sql/pglite/contrib/btree_gist'
  );
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec('CREATE EXTENSION btree_gist;');
  const baseline = await readFile(
    new URL('../migrations/00000000000000_baseline.sql', import.meta.url),
    'utf8'
  );
  const required = (pattern) => {
    const match = baseline.match(pattern);
    if (!match) throw new Error(`Baseline SQL not found: ${pattern}`);
    return match[0];
  };
  const functionSql = (name) =>
    required(new RegExp(`CREATE OR REPLACE FUNCTION "public"\."${name}"[\\s\\S]*?\\$\\$;`));
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
    $$;
  `);
  await db.exec(
    (baseline.match(/CREATE TYPE "public"\."[^"]+" AS ENUM \([\s\S]*?\);/g) ?? []).join('\n')
  );
  await db.exec(
    'CREATE SEQUENCE public.motoristas_codigo_seq; CREATE SEQUENCE public.clientes_codigo_seq;'
  );
  await db.exec('SET check_function_bodies = off;');
  await db.exec(functionSql('get_current_org_id'));
  await db.exec('SET check_function_bodies = on;');
  for (const name of tableNames) {
    await db.exec(
      required(new RegExp(`CREATE TABLE IF NOT EXISTS "public"\."${name}" \\([\\s\\S]*?\\n\\);`))
    );
    const constraints =
      baseline.match(
        new RegExp(`ALTER TABLE ONLY "public"\."${name}"\\s+ADD CONSTRAINT [^;]+;`, 'g')
      ) ?? [];
    for (const constraint of constraints.filter((sql) => !sql.includes('FOREIGN KEY')))
      await db.exec(constraint);
    await db.exec(`GRANT ALL ON public.${name} TO authenticated, service_role;`);
  }
  await db.exec(
    `ALTER TABLE public.clientes ALTER COLUMN codigo SET DEFAULT nextval('public.clientes_codigo_seq');`
  );
  await db.exec(functionSql('has_permission_edit'));
  await db.exec(functionSql('has_permission'));
  await db.exec(functionSql('is_current_user_admin'));
  // Duplo de cron_invocar_edge: regista a chamada como a real, sem pg_net nem Vault.
  await db.exec(`
    CREATE TABLE public.cron_http_log (
      id bigserial PRIMARY KEY, jobname text NOT NULL, url text NOT NULL,
      request_id bigint NOT NULL, invoked_at timestamptz NOT NULL DEFAULT now(),
      alertado_em timestamptz
    );
    CREATE FUNCTION public.cron_invocar_edge(
      p_jobname text, p_funcao text, p_body jsonb DEFAULT '{}'::jsonb, p_timeout_ms integer DEFAULT 60000
    ) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
    BEGIN
      INSERT INTO public.cron_http_log (jobname, url, request_id) VALUES (p_jobname, p_funcao, 1);
      RETURN 1;
    END $$;
    REVOKE ALL ON FUNCTION public.cron_invocar_edge(text, text, jsonb, integer) FROM PUBLIC;
  `);
  for (const name of ['renting_tarifas', 'renting_tarifa_precos_modelo', 'viatura_modelos']) {
    await db.exec(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;`);
    const policies =
      baseline.match(new RegExp(`CREATE POLICY [^\\n]+ ON "public"\."${name}" [^;]+;`, 'g')) ?? [];
    for (const policy of policies) await db.exec(policy);
  }
  for (const name of [
    'motorista_financeiro_recorrencia_periodo_unico',
    'motorista_financeiro_seguro_ref_unico',
    'contrato_cobrancas_slot_periodo_unico',
    'idx_via_verde_sync_queue_one_active',
  ]) {
    await db.exec(required(new RegExp(`CREATE UNIQUE INDEX "${name}"[^;]+;`)));
  }
  for (const name of [
    ...rpcNames,
    'fn_slot_inserir_cobranca',
    'fn_slot_cobranca_entrada',
    'gerar_cobrancas_slot_mensais',
  ]) {
    await db.exec(functionSql(name));
    const grants =
      baseline.match(
        new RegExp(`(?:GRANT|REVOKE) [^\\n]+ ON FUNCTION "public"\."${name}"[^;]+;`, 'g')
      ) ?? [];
    for (const grant of grants) await db.exec(grant);
  }
  await db.exec(required(/CREATE OR REPLACE TRIGGER "trg_slot_cobranca_entrada"[^;]+;/));
  if (!process.env.WEGEST_RPC_BASELINE_ONLY) {
    for (const migration of [
      '20260925120246_endurecer_rpcs_auditoria_seguranca.sql',
      '20260925130000_via_verde_pedido_manual.sql',
    ]) {
      await db.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    }
  }
  return db;
}

export async function seedFixture(db) {
  const id = ids;
  await db.exec(`
    INSERT INTO public.user_org_ativa (user_id, org_id) VALUES
      ('${id.adminA}', '${id.orgA}'), ('${id.adminB}', '${id.orgB}'),
      ('${id.readerA}', '${id.orgA}'), ('${id.editorA}', '${id.orgA}');
    INSERT INTO public.user_organizacoes (user_id, org_id, is_admin, cargo_id) VALUES
      ('${id.adminA}', '${id.orgA}', true, NULL), ('${id.adminB}', '${id.orgB}', true, NULL),
      ('${id.readerA}', '${id.orgA}', false, NULL), ('${id.editorA}', '${id.orgA}', false, '${id.cargoA}');
    INSERT INTO public.recursos (id, nome, categoria) VALUES ('${id.resource}', 'viaturas_grupos', 'viaturas');
    INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, pode_editar, org_id)
      VALUES ('${id.cargoA}', '${id.resource}', true, true, '${id.orgA}');
    INSERT INTO public.renting_tarifas (id, org_id, nome) VALUES
      ('${id.tarifaA}', '${id.orgA}', 'Tarifa A'), ('${id.tarifaA2}', '${id.orgA}', 'Tarifa A2'),
      ('${id.tarifaB}', '${id.orgB}', 'Tarifa B');
    INSERT INTO public.viatura_modelos (id, org_id, marca_id, nome) VALUES
      ('${id.modeloA}', '${id.orgA}', '${id.orgA}', 'Modelo A'), ('${id.modeloB}', '${id.orgB}', '${id.orgB}', 'Modelo B');
    INSERT INTO public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_semana) VALUES
      ('${id.orgA}', '${id.tarifaA}', '${id.modeloA}', 100), ('${id.orgB}', '${id.tarifaB}', '${id.modeloB}', 200);
    INSERT INTO public.clientes (id, org_id, nome, tipo_cliente) VALUES ('${id.clienteB}', '${id.orgB}', 'Cliente B', 'condutor');
    INSERT INTO public.motoristas_ativos (id, org_id, nome, nif, email, seguro_valor_semanal, cliente_id) VALUES
      ('${id.motoristaA}', '${id.orgA}', 'Motorista A', '123456789', 'a@example.test', 10, NULL),
      ('${id.motoristaB}', '${id.orgB}', 'Motorista B', '987654321', 'b@example.test', 20, NULL),
      ('${id.motoristaCache}', '${id.orgA}', 'Ligação inválida', '111111111', 'cache@example.test', NULL, '${id.clienteB}');
    INSERT INTO public.motorista_financeiro_recorrencias
      (id, org_id, motorista_id, tipo, descricao, valor, frequencia, semana_ancora) VALUES
      ('${id.recorrenciaA}', '${id.orgA}', '${id.motoristaA}', 'debito', 'Recorrência A', 15, 'semanal', date_trunc('week', current_date)),
      ('${id.recorrenciaB}', '${id.orgB}', '${id.motoristaB}', 'debito', 'Recorrência B', 25, 'semanal', date_trunc('week', current_date));
    INSERT INTO public.plataformas_configuracao (id, org_id, nome, plataforma) VALUES
      ('${id.viaVerdeA}', '${id.orgA}', 'Via Verde A', 'via_verde'),
      ('${id.viaVerdeB}', '${id.orgB}', 'Via Verde B', 'via_verde'),
      ('${id.boltA}', '${id.orgA}', 'Bolt A', 'bolt');
    INSERT INTO public.via_verde_sync_queue (integracao_id, org_id, created_at)
      SELECT gen_random_uuid(), CASE WHEN i % 2 = 0 THEN '${id.orgA}'::uuid ELSE '${id.orgB}'::uuid END,
        now() + i * interval '1 second' FROM generate_series(1, 6) i;
  `);
}

export async function asRole(db, role, userId, callback) {
  if (!['anon', 'authenticated', 'service_role'].includes(role))
    throw new Error('Invalid test role');
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ role, sub: userId }),
  ]);
  await db.exec(`SET ROLE ${role};`);
  try {
    return await callback();
  } finally {
    await db.exec('RESET ROLE;');
  }
}
