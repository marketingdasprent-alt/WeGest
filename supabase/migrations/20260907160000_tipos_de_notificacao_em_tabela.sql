-- ============================================================================
-- Os tipos de notificação passam a viver numa tabela, não num CHECK
-- ============================================================================
--
-- `notificacoes.tipo` era validado por um CHECK com a lista de tipos escrita
-- por extenso. O Postgres não deixa acrescentar um valor a um CHECK (ao
-- contrário de um enum, que tem ALTER TYPE ... ADD VALUE): a expressão é uma
-- só, e para permitir mais um tipo é preciso DROP + ADD com a lista INTEIRA
-- repetida.
--
-- Isso já foi feito três vezes nas últimas migrações, e cada uma foi uma
-- oportunidade de partir tudo em silêncio: basta esquecer um dos tipos
-- antigos na re-escrita para esse género de notificação passar a falhar — no
-- cron das 8h, sem ninguém dar por isso durante dias. E se as duas instruções
-- forem aplicadas à mão uma de cada vez, entre elas a tabela fica sem
-- validação nenhuma.
--
-- Com uma tabela de referência, acrescentar um tipo é um INSERT de uma linha.
-- Não há lista para repetir, logo não há lista para estragar.
--
-- A ordem aqui importa: a tabela é semeada ANTES de a chave estrangeira
-- existir, e é semeada a partir de duas fontes — a lista conhecida e o que
-- está mesmo em `notificacoes`. A segunda é a rede de segurança: garante que
-- a FK não pode ser recusada por dados existentes, em qualquer ambiente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."notificacao_tipos" (
  "tipo" text PRIMARY KEY,
  "descricao" text
);

COMMENT ON TABLE "public"."notificacao_tipos" IS
  'Tipos aceites em notificacoes.tipo. Substitui o CHECK que obrigava a reescrever a lista toda a cada tipo novo. Referencia global (sem org_id): os tipos sao do produto, nao de cada organizacao.';

INSERT INTO "public"."notificacao_tipos" ("tipo")
SELECT unnest(ARRAY[
  'motorista_pendente', 'escalonamento', 'viatura_disponivel', 'pedido_troca_kms',
  'recibo_anulado', 'viatura_seguro_expirando', 'viatura_inspecao_expirando',
  'motorista_carta_expirando', 'motorista_licenca_tvde_expirando', 'cobranca_gerada',
  'utilizador_criado', 'contrato_renting_renovacao_proxima', 'sistema_limite_email_atingido',
  'sistema_job_falhou', 'contrato_renting_criado', 'motorista_candidatura_parada',
  'contrato_renting_sem_checkin', 'viatura_extintor_expirando', 'viatura_iuc_a_pagar',
  'viatura_manutencao_preventiva_expirando', 'motorista_reparacao_cobranca',
  'assistencia_ticket_aberto_demasiado_tempo', 'motorista_ficha_incompleta',
  'invoice_nao_enviada_ao_cliente', 'seguranca_login_suspeito',
  'cobranca_em_atraso', 'motorista_recibo_por_validar', 'custo_sem_viatura'
])
ON CONFLICT ("tipo") DO NOTHING;

-- Rede de segurança: o que existir na tabela e não estiver na lista acima
-- entra na mesma. Sem isto, uma base com um tipo legado esquecido fazia a FK
-- abaixo ser recusada — e a migração abortava a meio.
INSERT INTO "public"."notificacao_tipos" ("tipo")
SELECT DISTINCT n."tipo" FROM "public"."notificacoes" n WHERE n."tipo" IS NOT NULL
ON CONFLICT ("tipo") DO NOTHING;

INSERT INTO "public"."notificacao_tipos" ("tipo")
SELECT DISTINCT m."tipo_legado" FROM "public"."notificacao_tipo_map" m WHERE m."tipo_legado" IS NOT NULL
ON CONFLICT ("tipo") DO NOTHING;

-- Mesmo padrão do `notificacao_tipo_map`, que é a outra tabela de referência
-- global: leitura para quem tem sessão, porta fechada ao anónimo.
ALTER TABLE "public"."notificacao_tipos" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_notificacao_tipos_select" ON "public"."notificacao_tipos";
CREATE POLICY "mt_notificacao_tipos_select" ON "public"."notificacao_tipos"
  FOR SELECT TO "authenticated" USING (true);

DROP POLICY IF EXISTS "rls_deny_anon" ON "public"."notificacao_tipos";
CREATE POLICY "rls_deny_anon" ON "public"."notificacao_tipos"
  AS RESTRICTIVE FOR ALL TO "anon" USING (false) WITH CHECK (false);

GRANT SELECT ON TABLE "public"."notificacao_tipos" TO "authenticated";
GRANT ALL ON TABLE "public"."notificacao_tipos" TO "service_role";

-- A troca. Sai o CHECK, entra a chave estrangeira.
ALTER TABLE "public"."notificacoes" DROP CONSTRAINT IF EXISTS "notificacoes_tipo_check";
ALTER TABLE "public"."notificacoes" DROP CONSTRAINT IF EXISTS "notificacoes_tipo_fkey";
ALTER TABLE "public"."notificacoes"
  ADD CONSTRAINT "notificacoes_tipo_fkey" FOREIGN KEY ("tipo")
  REFERENCES "public"."notificacao_tipos"("tipo");

-- O mapa evento→tipo passa a ser validado pela mesma tabela: uma gralha no
-- `tipo_legado` deixa de só se descobrir quando a regra dispara.
ALTER TABLE "public"."notificacao_tipo_map" DROP CONSTRAINT IF EXISTS "notificacao_tipo_map_tipo_legado_fkey";
ALTER TABLE "public"."notificacao_tipo_map"
  ADD CONSTRAINT "notificacao_tipo_map_tipo_legado_fkey" FOREIGN KEY ("tipo_legado")
  REFERENCES "public"."notificacao_tipos"("tipo");
