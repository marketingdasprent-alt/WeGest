-- Destinatários das automações passam a ser só os cargos configurados.
--
-- APLICADA EM PRODUÇÃO a 2026-09-09 (registada como `destinatarios_so_por_cargo`).
--
-- O problema: em `processar_automation_run`, a selecção de destinatários tinha
-- um ramo `uo.is_admin = true` em OR com os cargos da regra. Resultado: todos
-- os admins da org recebiam TODAS as notificações internas, por cima do que a
-- regra dizia — um "Suporte de TI (Admin)" recebia avisos de ficha de
-- motorista sem nunca estar na lista.
--
-- Duas partes, e a ordem importa:
--
--   1. Preencher o cargo em falta nas regras com a lista vazia. Estas só
--      chegavam a alguém pela cópia automática para os admins; sem o passo 1,
--      o passo 2 deixava-as mudas — incluindo a de login suspeito, que é de
--      segurança. Foram 12 regras (3 × 4 orgs); a Década Ousada já as tinha
--      configuradas e não foi tocada.
--   2. Tirar essa cópia automática da função.
--
-- Emails não mudam: o ramo removido já os excluía (`acao_tipo <> 'email'`).
--
-- Nota sobre 'gestor_responsavel': quando o gestor não é resolvido pelo nome,
-- a regra deixa de ter destinatário em vez de cair nos admins. Nenhuma regra
-- activa usa essa estratégia.

-- ── 1. Cargo em falta → "Administrador" da própria org ─────────────────────
update public.automation_rules r
   set acao_config = r.acao_config
       || jsonb_build_object(
            'destinatarios_modo', 'grupo',
            'destinatarios_estrategia', 'cargo',
            'destinatarios_cargo_ids', jsonb_build_array(c.id::text)
          )
  from public.cargos c
 where c.org_id = r.org_id
   and lower(btrim(c.nome)) = 'administrador'
   and r.ativo
   and r.acao_tipo = 'notificacao'
   and coalesce(r.acao_config->>'destinatarios_estrategia', 'cargo') = 'cargo'
   and jsonb_array_length(coalesce(r.acao_config->'destinatarios_cargo_ids', '[]'::jsonb)) = 0
   and jsonb_array_length(coalesce(r.acao_config->'destinatarios_user_ids', '[]'::jsonb)) = 0;

-- ── 2. A função deixa de acrescentar os admins por cima da configuração ────
-- A substituição é feita sobre a definição VIVA, em vez de reescrever as ~320
-- linhas da função. Assim só muda este bloco: se a função tiver entretanto
-- levado outras alterações, elas ficam de pé. Não faz nada se já estiver
-- aplicada, e aborta se não reconhecer o bloco — nunca deixa a função a meio.
do $mig$
declare
  v_def text;
  v_antes text := $antes$            and (
              (uo.is_admin = true and v_rule.acao_tipo <> 'email')
              or (
                v_estrategia = 'cargo'
                and uo.cargo_id is not null
                and (
                  (v_modo = 'individual' and uo.user_id = any(v_user_ids))
                  or (v_modo <> 'individual' and uo.cargo_id = any(v_cargo_ids))
                )
              )
            )$antes$;
  v_depois text := $depois$            -- Sem rede de admin: quem recebe é EXACTAMENTE quem a regra
            -- configurou. O ramo `uo.is_admin = true` que aqui estava punha
            -- uma cópia de todas as notificações internas na caixa de todos
            -- os admins da org, por cima dos cargos escolhidos — um Suporte
            -- de TI recebia avisos de ficha de motorista sem nunca estar na
            -- lista da regra.
            and v_estrategia = 'cargo'
            and uo.cargo_id is not null
            and (
              (v_modo = 'individual' and uo.user_id = any(v_user_ids))
              or (v_modo <> 'individual' and uo.cargo_id = any(v_cargo_ids))
            )$depois$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'processar_automation_run'
     and p.prokind = 'f';

  if v_def is null then
    raise exception 'processar_automation_run nao encontrada';
  end if;

  if position(v_depois in v_def) > 0 then
    raise notice 'ja aplicada — nada a fazer';
    return;
  end if;

  if position(v_antes in v_def) = 0 then
    raise exception 'bloco de destinatarios nao encontrado — nada aplicado';
  end if;

  execute replace(v_def, v_antes, v_depois);
end
$mig$;

revoke all on function public.processar_automation_run(public.automation_runs) from public, anon, authenticated;
grant execute on function public.processar_automation_run(public.automation_runs) to service_role;

notify pgrst, 'reload schema';
