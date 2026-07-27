-- Motor de Automação — Fase 2, Sub-projeto 7: semear as 4 regras que
-- emit_expiry_events() (Sub-projeto 2) já alimenta, para toda organização
-- existente e para as que forem criadas a partir de agora.
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-seed-regras.md.

create or replace function public.seed_automacao_defaults(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config, cooldown_minutos)
  values
    (
      p_org_id, 'viatura.seguro_expirando', 'Seguro de viatura a expirar', 'viatura.seguro_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.seguro_expirando', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', false, 'titulo', 'Seguro de viatura a expirar'),
      1440
    ),
    (
      p_org_id, 'viatura.inspecao_expirando', 'Inspeção periódica (IPO) a expirar', 'viatura.inspecao_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'viatura.inspecao_expirando', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', false, 'titulo', 'Inspeção periódica (IPO) a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.carta_expirando', 'Carta de condução do motorista a expirar', 'motorista.carta_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.carta_expirando', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', false, 'titulo', 'Carta de condução do motorista a expirar'),
      1440
    ),
    (
      p_org_id, 'motorista.licenca_tvde_expirando', 'Licença TVDE do motorista a expirar', 'motorista.licenca_tvde_expirando', 'notificacao',
      jsonb_build_object('template_codigo', 'motorista.licenca_tvde_expirando', 'destinatarios_recurso', 'motoristas_gestao', 'enviar_email', false, 'titulo', 'Licença TVDE do motorista a expirar'),
      1440
    )
  on conflict (codigo, org_id) do nothing;
end;
$$;

-- Backfill para organizações já existentes.
do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizacoes loop
    perform public.seed_automacao_defaults(v_org.id);
  end loop;
end;
$$;

-- Trigger: toda organização nova recebe as mesmas 4 regras automaticamente.
create or replace function public.trg_organizacoes_seed_automacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_automacao_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists trg_organizacoes_seed_automacao on public.organizacoes;
create trigger trg_organizacoes_seed_automacao
  after insert on public.organizacoes
  for each row
  execute function public.trg_organizacoes_seed_automacao();
