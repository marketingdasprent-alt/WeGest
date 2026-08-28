-- ============================================================
-- Assinatura digital no handover (entrega/recolha/troca)
-- Tabela: assinaturas_handover  (1 evento → até 2 linhas: motorista + responsavel)
-- Multi-tenant: org_id + RLS RESTRICTIVE rls_org_isolation (ver [[project-rls-org-isolation]]).
-- Idempotente: aplicar à mão no SQL editor.
-- ============================================================
create table if not exists public.assinaturas_handover (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.get_current_org_id() references public.organizacoes(id),
  calendario_evento_id uuid references public.calendario_eventos(id) on delete cascade,
  contrato_id uuid,
  papel text not null check (papel in ('motorista', 'responsavel')),
  signatario_nome text not null,
  signatario_id uuid,
  storage_path text not null,
  assinado_em timestamptz not null default now(),
  assinado_por_id uuid not null
);

create index if not exists idx_assinaturas_handover_evento
  on public.assinaturas_handover (calendario_evento_id);
create index if not exists idx_assinaturas_handover_contrato
  on public.assinaturas_handover (contrato_id);

alter table public.assinaturas_handover enable row level security;

-- Barreira de isolamento por org (fail-closed). Igual ao loop genérico das
-- migrations rls_org_isolation; declarada aqui para a tabela ser self-contained.
drop policy if exists rls_org_isolation on public.assinaturas_handover;
create policy rls_org_isolation on public.assinaturas_handover
  as restrictive for all to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id is null or org_id = public.get_current_org_id());

-- Acesso permissivo aos utilizadores autenticados da própria org.
drop policy if exists ah_all on public.assinaturas_handover;
create policy ah_all on public.assinaturas_handover
  for all to authenticated
  using (org_id = public.get_current_org_id())
  with check (org_id = public.get_current_org_id());
