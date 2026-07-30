-- ============================================================
-- Causa raiz da exposição anónima — fechar a torneira, não os buracos
-- ============================================================
-- A 2026-07-29 fecharam-se 8 políticas `USING(true)` que expunham 3631 linhas
-- (20260729160000_fechar_fuga_dados_anonima.sql). Verificado a 2026-07-30 que
-- essa correcção está aplicada: só `formularios` e `formulario_campanhas`
-- ainda devolvem linhas a um pedido anónimo (4 cada, de todas as orgs).
--
-- Fechou-se o sintoma. Esta migração fecha a condição que o produziu, medida
-- em produção:
--
--   1. Os default privileges do schema `public` concedem `arwdDxtm` (SELECT,
--      INSERT, UPDATE, DELETE) a `anon`. TODA a tabela nova nasce legível e
--      escrevível pelo anónimo. Daí 172 das 174 tabelas terem SELECT para
--      `anon` sem ninguém o ter decidido.
--
--   2. Das 139 políticas RESTRICTIVE `rls_org_isolation`, 138 são
--      `TO authenticated`. O papel `anon` nunca é cruzado com
--      `org_id = get_current_org_id()`. Uma tabela nova só está protegida
--      enquanto ninguém lhe criar uma política permissiva sem `TO` — e o
--      default de `TO` é PUBLIC, que inclui `anon`.
--
--   3. `Qualquer um pode criar leads` é PERMISSIVE, TO public,
--      `with check (true)`. As permissivas somam-se, logo anula o
--      `anon_leads_insert` que restringe à org DASPRENT: qualquer pessoa pode
--      injectar leads em qualquer uma das 5 organizações. Confirmado por POST
--      anónimo — devolveu 409 (chave estrangeira), ou seja passou a RLS.
--
-- Rollback em supabase/rollbacks/20260730084228_rollback_isolamento_anon.sql
-- (fora de migrations/ de propósito: ali seria aplicado a seguir a esta e
-- desfá-la-ia num db push ou num clone novo).
-- Desenho em docs/superpowers/specs/2026-07-30-isolamento-anon-causa-raiz-design.md
--
-- FORA DE ÂMBITO, registado: ~135 funções SECURITY DEFINER em `public` são
-- executáveis por `anon` e ignoram RLS por completo. Precisam de auditoria
-- própria, função a função.
-- ============================================================

-- ------------------------------------------------------------
-- CAMADA 1 — a torneira: default privileges e grants
-- ------------------------------------------------------------
-- Esta é a causa raiz. As camadas seguintes são defesa em profundidade.
--
-- Limitação conhecida: `pg_has_role('postgres','supabase_admin','MEMBER')` é
-- false, por isso não é possível alterar o default ACL do segundo concedente.
-- Tabelas criadas POR `supabase_admin` continuam a nascer com grants para
-- `anon`. As migrações correm como `postgres`, que é o caminho normal, e a
-- asserção de CI em rls_anon_exposure.test.sql apanha o resto.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Reconceder o mínimo, e só o mínimo. Cada linha corresponde a um fluxo
-- anónimo verificado em src/routes/WebAppRoutes.tsx:109-131.
--
-- Login por código de org (src/pages/Login.tsx), registo de org
-- (src/pages/RegistarOrg.tsx) e registo de motorista (src/lib/org-codigo.ts).
-- Grant por COLUNA, não da tabela: repõe o que 20260729160000 definiu e que o
-- `revoke all` acima apagaria. Sem esta linha o login por código morre.
grant select (id, nome, codigo, ativa) on public.organizacoes to anon;

-- Formulário de leads da landing (src/components/landing/SmartForm.tsx:130) e
-- do formulário público (src/pages/FormularioPublico.tsx:372). Só INSERT: o
-- anónimo nunca teve política de SELECT nesta tabela.
grant insert on public.leads_dasprent to anon;

-- Registo de tentativas de login, para o rate limit em
-- fn_login_attempts_rate_limit (src/pages/Login.tsx).
grant insert on public.login_attempts to anon;

-- As 5 views de `public` com grant a `anon` (automacao_estatisticas_por_regra,
-- automacao_saude_canais, automacao_timeline_recente, contrato_renting_totais,
-- cron_edge_health) perdem-no acima e não são reconcedidas: nenhuma serve
-- fluxo público. São todas `security_invoker=true`, portanto já respeitavam a
-- RLS de quem chama — o grant era apenas superfície a mais.
--
-- O `revoke all on all sequences` é seguro porque `leads_dasprent` e
-- `login_attempts` têm chaves UUID: nenhuma tem coluna `identity` nem default
-- com `nextval` (verificado em pg_attribute/pg_attrdef). Se alguma passar a
-- usar sequence, o insert anónimo parte e é preciso reconceder `usage`.

-- ------------------------------------------------------------
-- CAMADA 2 — a rede: negar `anon` explicitamente
-- ------------------------------------------------------------
-- Uma RESTRICTIVE `TO anon USING (false)` em cada tabela fora da allowlist.
--
-- Porque não estender `rls_org_isolation` a `anon`, que era a sugestão
-- inicial: funcionaria, porque `get_current_org_id()` faz
-- `select org_id from user_org_ativa where user_id = auth.uid()` e para o
-- anónimo `auth.uid()` é NULL, logo `org_id = NULL` nunca é TRUE. Mas a
-- negação seria IMPLÍCITA — depende de a função devolver NULL. No dia em que
-- alguém lhe puser uma org por omissão, todos os anónimos ganham essa org.
-- `using (false)` não pode falhar assim.
--
-- É também puramente aditivo: não reescreve 136 políticas que estão
-- correctas, e o rollback é apagar o que foi acrescentado.
do $$
declare
  r record;
  -- As três tabelas com acesso anónimo legítimo. Acrescentar aqui exige
  -- justificação e uma entrada correspondente em rls_anon_exposure.test.sql.
  allowlist text[] := array['organizacoes', 'leads_dasprent', 'login_attempts'];
  criadas int := 0;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind in ('r', 'p')
      and c.relname <> all (allowlist)
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.policyname = 'rls_deny_anon'
      )
    order by c.relname
  loop
    execute format(
      'create policy rls_deny_anon on public.%I '
      'as restrictive for all to anon using (false) with check (false)',
      r.relname
    );
    criadas := criadas + 1;
  end loop;
  raise notice 'rls_deny_anon criada em % tabelas', criadas;
end $$;

-- ------------------------------------------------------------
-- CAMADA 3 — o formulário público deixa de precisar de ler tabelas
-- ------------------------------------------------------------
-- src/pages/FormularioPublico.tsx fazia duas leituras anónimas: `formularios`
-- por id e `formulario_campanhas` por formulario_id. Ambas sem filtro de org,
-- o que deixava o anónimo LISTAR os formulários das 5 organizações — o mesmo
-- padrão do incidente do `cargos`, com dados menos sensíveis.
--
-- A página só usa `nome`, `descricao` e `campos` (verificado no ficheiro), e
-- já sabe o `id` pelo URL. Uma função estreita substitui as duas leituras e
-- fecha a enumeração: exige o id, e devolve 4 campos em vez da linha inteira
-- (`org_id`, `ativo`, `created_at` e `updated_at` ficam de fora).
create or replace function public.formulario_publico_por_id(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',        f.id,
    'nome',      f.nome,
    'descricao', f.descricao,
    'campos',    f.campos,
    'campanhas', coalesce(
      (select jsonb_agg(fc.campanha_tag order by fc.campanha_tag)
         from public.formulario_campanhas fc
        where fc.formulario_id = f.id),
      '[]'::jsonb
    )
  )
  from public.formularios f
  where f.id = p_id
    and f.ativo = true;
$$;

comment on function public.formulario_publico_por_id(uuid) is
  'Formulário público por id, para /formulario/:id sem sessão. SECURITY '
  'DEFINER porque anon já não tem SELECT em formularios nem em '
  'formulario_campanhas. Só devolve formulários com ativo = true, exige o id '
  '(sem enumeração) e omite org_id/ativo/timestamps.';

-- `create function` concede EXECUTE a PUBLIC por omissão. Estreitar.
revoke all on function public.formulario_publico_por_id(uuid) from public;
grant execute on function public.formulario_publico_por_id(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- CAMADA 4 — fechar a injecção de leads entre organizações
-- ------------------------------------------------------------
-- Coberturas que ficam: `anon_leads_insert` (with check org_id = DASPRENT)
-- para o formulário público, `mt_leads_insert` (org + permissão) para
-- autenticados, `Admins can manage leads` para admins. Nenhum caminho
-- legítimo perde acesso.
drop policy if exists "Qualquer um pode criar leads" on public.leads_dasprent;
