-- ============================================================================
-- O resumo diário volta a mostrar o dado que interessa
-- ============================================================================
--
-- `enviar_digests_diarios` monta cada linha do resumo como
-- `titulo || ': ' || mensagem`. Desde que o motor passou a inserir
-- notificações via `processar_automation_run`, esse insert nunca escreve
-- `mensagem` — só título, payload e o resto. O resultado: TODO o email de
-- resumo diário, para todas as organizações, mostra só o título nu
-- ("Contrato a renovar") e nunca o resto, mesmo quando o payload tem tudo
-- (matrícula, cliente, prazo, código).
--
-- Sem `mensagem`, a linha passa a usar o `payload` da notificação — as
-- mesmas etiquetas que já lá estão, formatadas como "Campo: valor". Fica de
-- fora `link` (URL crua, feia numa linha de texto) e qualquer chave que
-- termine em `_id` (uuids internos, nunca legíveis). Datas em ISO
-- (YYYY-MM-DD...) passam a DD/MM/AAAA.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."enviar_digests_diarios"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_grupo record;
  v_notification_id uuid;
begin
  for v_grupo in
    select
      n.org_id,
      n.destinatario_user_id,
      u.email,
      count(*)::int as total,
      array_agg(n.id) as notif_ids,
      string_agg(
        n.titulo || coalesce(
          ' — ' || nullif(
            coalesce(
              nullif(n.mensagem, ''),
              (
                select string_agg(
                  initcap(replace(kv.key, '_', ' ')) || ': ' ||
                    case
                      when kv.value ~ '^\d{4}-\d{2}-\d{2}' then
                        substring(kv.value from 9 for 2) || '/' || substring(kv.value from 6 for 2) || '/' || substring(kv.value from 1 for 4)
                      else left(kv.value, 80)
                    end,
                  ', '
                  order by kv.key
                )
                from jsonb_each_text(n.payload) kv
                where kv.key <> 'link'
                  and kv.key !~ '_id$'
                  and kv.value is not null
                  and kv.value <> ''
              )
            ),
            ''
          ),
          ''
        ),
        '<br>' order by n.created_at
      ) as lista_html
    from public.notifications n
    join public.automation_runs r on r.id = n.rule_run_id
    join public.automation_rules ar on ar.id = r.rule_id
    join auth.users u on u.id = n.destinatario_user_id
    where n.digest_enviado_em is null
      and coalesce((ar.acao_config->>'enviar_email_digest')::boolean, false) = true
    group by n.org_id, n.destinatario_user_id, u.email
  loop
    if v_grupo.email is null then
      continue;
    end if;

    insert into public.notifications (org_id, destinatario_user_id, template_codigo, titulo, mensagem, payload)
    values (
      v_grupo.org_id,
      v_grupo.destinatario_user_id,
      'digest.resumo_diario',
      'Resumo diário de automações',
      v_grupo.total || ' aviso(s) novo(s)',
      jsonb_build_object('total', v_grupo.total, 'lista', v_grupo.lista_html)
    )
    returning id into v_notification_id;

    insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
    values (
      v_notification_id,
      v_grupo.org_id,
      'email',
      v_grupo.email,
      'digest.resumo_diario',
      jsonb_build_object('total', v_grupo.total, 'lista', v_grupo.lista_html)
    );

    update public.notifications
    set digest_enviado_em = now()
    where id = any(v_grupo.notif_ids);
  end loop;
end;
$$;
