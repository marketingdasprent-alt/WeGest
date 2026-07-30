-- ============================================================
-- O código de organização deixa de ser enumerável
-- ============================================================
-- Depois de 20260729160000, `anon` mantinha `select (id, nome, codigo, ativa)`
-- em `organizacoes` porque o login por código precisa de resolver o código
-- antes de haver sessão. Efeito colateral: `GET /organizacoes?select=codigo`
-- devolvia os códigos das 5 organizações a qualquer visitante.
--
-- Isso importa porque o código NÃO é um identificador inócuo — é o que
-- autoriza o registo de motorista numa organização
-- (src/pages/motorista/RegistoMotorista.tsx passa o org_id resolvido pelo
-- código para o signUp). Um segredo que vem listado no primeiro pedido HTTP
-- não é um segredo.
--
-- SOLUÇÃO: duas funções estreitas, e o `anon` perde o acesso à tabela.
-- Continua a ser possível TESTAR um código de cada vez — é inerente a deixar
-- alguém escrever o código da sua empresa — mas deixa de ser possível LISTAR.
-- É a mesma troca que se fez em formulario_publico_por_id: exigir a chave em
-- vez de devolver o conjunto.
--
-- Os dois consumidores anónimos precisam de coisas diferentes:
--   src/lib/org-codigo.ts    resolve um código -> {id, nome}, só orgs activas
--   src/pages/RegistarOrg.tsx  verifica se um código está livre, incluindo
--                              contra orgs inactivas
--
-- src/pages/Login.tsx NÃO entra aqui: a leitura dele acontece depois do
-- signInWithPassword, já com sessão autenticada, e os autenticados mantêm o
-- grant de tabela intacto.
-- ============================================================

-- ------------------------------------------------------------
-- Resolver um código (rota /motorista/registo, pré-sessão)
-- ------------------------------------------------------------
create or replace function public.org_por_codigo(p_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', o.id, 'nome', o.nome)
  from public.organizacoes o
  where lower(btrim(o.codigo)) = lower(btrim(p_codigo))
    and o.ativa = true;
$$;

comment on function public.org_por_codigo(text) is
  'Resolve o código público de uma organização para {id, nome}. Exige o código '
  '(sem enumeração) e devolve 2 campos — nunca nif, morada ou telefone. '
  'Substitui a leitura anónima directa de organizacoes.';

-- ------------------------------------------------------------
-- Verificar se um código está livre (rota /registar-org, pré-sessão)
-- ------------------------------------------------------------
-- Devolve boolean, não a linha: quem pergunta fica a saber apenas se pode usar
-- aquele código. Não filtra por `ativa` de propósito — um código de uma org
-- inactiva continua ocupado.
create or replace function public.org_codigo_disponivel(p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.organizacoes o
    where lower(btrim(o.codigo)) = lower(btrim(p_codigo))
  );
$$;

comment on function public.org_codigo_disponivel(text) is
  'True se o código de organização ainda não está ocupado. Devolve boolean e '
  'não a linha, para não servir de janela para os dados da org existente.';

revoke all on function public.org_por_codigo(text) from public;
revoke all on function public.org_codigo_disponivel(text) from public;
grant execute on function public.org_por_codigo(text) to anon, authenticated;
grant execute on function public.org_codigo_disponivel(text) to anon, authenticated;

-- ------------------------------------------------------------
-- Fechar a tabela ao anónimo
-- ------------------------------------------------------------
-- O grant de tabela e o de coluna são entradas de ACL distintas: revogar o
-- primeiro não apaga o segundo. Daí as duas linhas.
revoke select on public.organizacoes from anon;
revoke select (id, nome, codigo, ativa) on public.organizacoes from anon;

-- `organizacoes` sai da allowlist e passa a ter a mesma rede que as outras 171
-- tabelas. A política permissiva `Permitir verificar codigo de org
-- publicamente` (USING(true), TO anon+authenticated) fica: é inofensiva sem
-- grant, e os autenticados continuam a precisar dela.
drop policy if exists rls_deny_anon on public.organizacoes;
create policy rls_deny_anon on public.organizacoes
  as restrictive for all to anon
  using (false) with check (false);
