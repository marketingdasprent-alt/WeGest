-- Quota do Brevo (plano gratuito, 300/dia) esgotava todos os dias: o aviso
-- "motorista registou km" mandava ~240 e-mails/dia (um por pessoa da equipa).
-- Passa a ficar só na app. O e-mail só entra na fila se a org tiver o modelo de
-- e-mail ativo para esse aviso; desligar um modelo deixa de gerar envios que
-- falhavam com "template não encontrado". A notificação na app é sempre criada.

CREATE OR REPLACE FUNCTION public.avisar_staff_envio_motorista(p_org_id uuid, p_motorista_id uuid, p_template_codigo text, p_titulo text, p_mensagem text, p_link text, p_entity_table text, p_entity_id uuid, p_payload jsonb, p_janela interval DEFAULT '00:10:00'::interval)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r       record;
  v_notif uuid;
  v_n     integer := 0;
  v_email_ativo boolean;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_janela IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.notifications
    WHERE org_id = p_org_id
      AND template_codigo = p_template_codigo
      AND link = p_link
      AND created_at > now() - p_janela
  ) THEN
    RETURN 0;
  END IF;

  v_email_ativo := EXISTS (
    SELECT 1 FROM public.notification_templates t
     WHERE t.org_id = p_org_id AND t.codigo = p_template_codigo
       AND t.canal = 'email' AND t.ativo
  );

  FOR r IN
    SELECT DISTINCT p.id AS user_id, p.email
    FROM public.user_organizacoes uo
    JOIN public.profiles p ON p.id = uo.user_id
    WHERE uo.org_id = p_org_id
      AND p.email IS NOT NULL
      AND btrim(p.email) <> ''
      AND (
        COALESCE(uo.is_admin, false)
        OR EXISTS (
          SELECT 1 FROM public.cargos c
          WHERE c.id = ANY (public.cargo_ids_do_utilizador(uo.user_id, uo.org_id))
            AND lower(c.nome) IN (
              'administrador',
              'gestor tvde',
              'supervisor gestor tvde',
              'financeiro',
              'faturação',
              'faturacao'
            )
        )
      )
  LOOP
    INSERT INTO public.notifications
      (org_id, destinatario_user_id, template_codigo, severidade, titulo, mensagem,
       link, entity_table, entity_id, payload)
    VALUES
      (p_org_id, r.user_id, p_template_codigo, 'normal', p_titulo, p_mensagem,
       p_link, p_entity_table, p_entity_id, COALESCE(p_payload, '{}'::jsonb))
    RETURNING id INTO v_notif;

    IF v_email_ativo THEN
    INSERT INTO public.notification_queue
      (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
    VALUES
      (v_notif, p_org_id, 'email', r.email, p_template_codigo, COALESCE(p_payload, '{}'::jsonb));
    END IF;

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$function$

;

UPDATE public.notification_templates
   SET ativo = false
 WHERE codigo = 'motorista.km_enviado' AND canal = 'email' AND ativo;

NOTIFY pgrst, 'reload schema';
