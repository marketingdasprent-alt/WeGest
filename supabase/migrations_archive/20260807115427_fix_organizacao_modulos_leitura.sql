-- ============================================================
-- FIX: organizacao_modulos deixou de ser legível pela app
-- ============================================================
-- Sintoma: o cartão "Slot" desapareceu do seletor de Regime em
-- Reservas → deixou de ser possível criar reservas (e, a jusante, o
-- contrato de prestação) no regime SLOT.
--
-- Causa: a migração 20260730165257_organizacao_modulos (aplicada
-- directamente em produção a 2026-07-30 16:52, nunca commitada no repo)
-- criou esta policy:
--
--     create policy "rls_modulos_sem_escrita_pela_api"
--       as restrictive for all to authenticated, anon
--       using (false) with check (false);
--
-- A intenção era "sem ESCRITA pela API". Mas `for all` cobre também o
-- SELECT, e as policies RESTRICTIVE combinam-se com AND. O resultado
-- efectivo do SELECT passou a ser:
--
--     (org_id = get_current_org_id())  AND  false   -->  sempre falso
--
-- ou seja, a tabela devolve ZERO linhas a qualquer utilizador
-- autenticado — e sem erro. O hook useModules() só faz fail-open quando
-- a TABELA NÃO EXISTE (código 42P01); uma lista vazia é interpretada
-- como "nenhum módulo activo", logo has('slot') === false e o
-- <RegimeCards allowSlot={false}> deixa de desenhar o cartão Slot.
--
-- Os dados estão correctos: todas as organizações têm modulo='slot'
-- com ativo=true. O que falha é só a leitura.
--
-- Correcção: remover a policy restritiva. A escrita CONTINUA fechada
-- pela API — com RLS activo e nenhuma policy PERMISSIVE de
-- INSERT/UPDATE/DELETE, o Postgres nega essas operações por omissão.
-- Reforça-se na mesma ao nível dos GRANTs (o role `authenticated` tinha
-- INSERT/UPDATE/DELETE herdados de um grant anterior).
-- ============================================================

drop policy if exists "rls_modulos_sem_escrita_pela_api" on public.organizacao_modulos;

-- Garante a policy de leitura por organização (idempotente).
drop policy if exists "rls_modulos_leitura_da_org" on public.organizacao_modulos;
create policy "rls_modulos_leitura_da_org" on public.organizacao_modulos
  for select to authenticated
  using (org_id = public.get_current_org_id());

-- Escrita fechada pela API, agora só pelos privilégios (sem tocar no SELECT).
revoke all on public.organizacao_modulos from anon, public;
revoke insert, update, delete, truncate, references, trigger
  on public.organizacao_modulos from authenticated;
grant select on public.organizacao_modulos to authenticated;

comment on table public.organizacao_modulos is
  'Módulos comerciais activos por organização. Leitura: todos os utilizadores '
  'autenticados da org (useModules). Escrita: apenas service_role/postgres — '
  'NÃO fechar a escrita com uma policy RESTRICTIVE `for all using (false)`, '
  'isso também bloqueia o SELECT (ver migração 20260807115427).';
