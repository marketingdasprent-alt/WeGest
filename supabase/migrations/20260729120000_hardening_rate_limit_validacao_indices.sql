-- Hardening do Motor de Automações (pré-produção) — Prioridade 2.
-- Reutiliza o padrão de trigger de validação já existente no projeto
-- (fn_validar_nif_iban, migração 20260611000002) e não cria tabelas novas.

-- ============================================================
-- 1) login_attempts: protege contra criação ilimitada de eventos.
--    Solução simples (sem tabela nova, sem IP — não disponível
--    client-side): duas capas largas, acima do limiar de deteção real
--    (5 tentativas/15min) para nunca interferir com o próprio motivo
--    de a tabela existir.
--      - por email: no máx. 20 linhas em 5 minutos;
--      - global: no máx. 200 linhas/minuto (circuit breaker contra
--        um flood de emails aleatórios/rotativos).
--    Falha silenciosa (RETURN NULL, sem RAISE) — o INSERT do frontend
--    é fire-and-forget (`void supabase.from(...).insert(...)`), não
--    há nada a mostrar ao utilizador nem motivo para poluir logs.
-- ============================================================

create or replace function public.fn_login_attempts_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_por_email integer;
  v_global integer;
begin
  select count(*) into v_por_email
  from public.login_attempts
  where email = new.email and created_at >= now() - interval '5 minutes';

  if v_por_email >= 20 then
    return null;
  end if;

  select count(*) into v_global
  from public.login_attempts
  where created_at >= now() - interval '1 minute';

  if v_global >= 200 then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_login_attempts_rate_limit on public.login_attempts;
create trigger trg_login_attempts_rate_limit
  before insert on public.login_attempts
  for each row execute function public.fn_login_attempts_rate_limit();

-- ============================================================
-- 2) automation_rules.acao_config: valida o shape antes de gravar,
--    mesma filosofia "catraca" do fn_validar_nif_iban — só valida em
--    INSERT ou quando acao_config muda de facto, para não bloquear
--    regras antigas em edições não relacionadas (ex.: só ligar/
--    desligar o switch "ativo").
-- ============================================================

create or replace function public.fn_validar_acao_config()
returns trigger
language plpgsql
as $$
declare
  v_estrategia text;
  v_modo text;
begin
  if new.acao_tipo <> 'notificacao' then
    return new;
  end if;

  if TG_OP = 'UPDATE' and new.acao_config is not distinct from old.acao_config then
    return new;
  end if;

  if not (new.acao_config ? 'template_codigo') or btrim(coalesce(new.acao_config->>'template_codigo', '')) = '' then
    raise exception 'acao_config inválido: template_codigo é obrigatório.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if not (new.acao_config ? 'titulo') or btrim(coalesce(new.acao_config->>'titulo', '')) = '' then
    raise exception 'acao_config inválido: titulo é obrigatório.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  v_estrategia := new.acao_config->>'destinatarios_estrategia';
  if v_estrategia is not null and v_estrategia not in ('cargo', 'gestor_responsavel', 'motorista') then
    raise exception 'acao_config inválido: destinatarios_estrategia "%" desconhecido.', v_estrategia
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'destinatarios_cargo_ids' and jsonb_typeof(new.acao_config->'destinatarios_cargo_ids') <> 'array' then
    raise exception 'acao_config inválido: destinatarios_cargo_ids tem de ser um array.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'destinatarios_user_ids' and jsonb_typeof(new.acao_config->'destinatarios_user_ids') <> 'array' then
    raise exception 'acao_config inválido: destinatarios_user_ids tem de ser um array.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  v_modo := new.acao_config->>'destinatarios_modo';
  if v_modo is not null and v_modo not in ('grupo', 'individual') then
    raise exception 'acao_config inválido: destinatarios_modo "%" desconhecido.', v_modo
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'enviar_email' and jsonb_typeof(new.acao_config->'enviar_email') <> 'boolean' then
    raise exception 'acao_config inválido: enviar_email tem de ser boolean.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'enviar_email_digest' and jsonb_typeof(new.acao_config->'enviar_email_digest') <> 'boolean' then
    raise exception 'acao_config inválido: enviar_email_digest tem de ser boolean.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_acao_config on public.automation_rules;
create trigger trg_validar_acao_config
  before insert or update on public.automation_rules
  for each row execute function public.fn_validar_acao_config();

-- ============================================================
-- 3) Índices com benefício concreto e observável (não especulativos):
--    - domain_events: todos os 9 emit_* fazem dedup via
--      "not exists (... entity_table=X and entity_id=Y and
--      event_type=Z and processed_at is null)" sem nenhum índice a
--      suportar esse padrão exato — só existia (entity_table,
--      entity_id) sem event_type/processed_at.
--    - automation_runs: o painel "Atividade" lê TODAS as linhas
--      (status, attempt, started_at) sem nenhum filtro para além do
--      org_id da RLS — sem índice, isto é scan completo por org à
--      medida que a tabela cresce (nunca é podada).
-- ============================================================

create index if not exists idx_domain_events_dedup_pendente
  on public.domain_events (entity_table, entity_id, event_type)
  where processed_at is null;

create index if not exists idx_automation_runs_org_created
  on public.automation_runs (org_id, created_at desc);
