-- ============================================================
-- Correcção a 20260730084227: os formulários de leads ficaram bloqueados
-- ============================================================
-- Segundo efeito colateral detectado na verificação pós-migração.
--
-- Ao remover `Qualquer um pode criar leads` (PERMISSIVE, TO public,
-- `with check (true)`), que era o buraco de injecção cross-org, a única
-- política de INSERT que sobra para `anon` é `anon_leads_insert`, com
-- `with check (org_id = '11111111-…')`.
--
-- Mas nenhum dos dois formulários públicos envia `org_id`:
--   src/pages/FormularioPublico.tsx:214      (leadData, sem org_id)
--   src/components/landing/SmartForm.tsx:119 (leadData, sem org_id)
--
-- O default da coluna era `get_current_org_id()`, que devolve NULL para o
-- anónimo. Resultado, reproduzido antes desta correcção:
--
--   42501: new row violates row-level security policy for table "leads_dasprent"
--
-- SOLUÇÃO — no default, não no frontend.
-- Alterar em dois ficheiros do frontend deixaria o id da org espalhado pela
-- UI; o default resolve num sítio só e mantém a intenção explícita: um lead
-- que chega sem sessão pertence à DASPRENT. É o mesmo id que
-- `anon_leads_insert` já exige, portanto não se acrescenta nenhum acoplamento
-- novo — apenas se põe do lado da base de dados, onde a política vive.
--
-- Para utilizadores autenticados nada muda: get_current_org_id() devolve a
-- org deles e o coalesce nunca chega ao segundo argumento.
-- ============================================================

alter table public.leads_dasprent
  alter column org_id set default
    coalesce(public.get_current_org_id(), '11111111-1111-1111-1111-111111111111'::uuid);

comment on column public.leads_dasprent.org_id is
  'Org do lead. Default: a org da sessão; sem sessão (formulários públicos), '
  'DASPRENT — o mesmo id que a política anon_leads_insert exige.';
