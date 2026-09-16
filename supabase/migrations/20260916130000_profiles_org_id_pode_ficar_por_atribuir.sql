-- Continuação de 20260916120000: agora um colaborador sem convite/app_metadata
-- fica sem org, mas profiles.org_id era NOT NULL e isso rebentava o insert.
-- Seguro tirar: get_current_org_id() lê de user_org_ativa, não desta coluna.

alter table public.profiles alter column org_id drop not null;

comment on column public.profiles.org_id is
  'NULL = colaborador sem convite/app_metadata, sem acesso a nada até ser convidado (auditoria 2026-09-16).';
