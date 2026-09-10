-- Quem abre um ticket passa a saber quando ele é resolvido.
--
-- Até aqui não acontecia nada: o único aviso de assistência era na ABERTURA
-- (fn_ticket_avisa_gestor_contrato, para o gestor do contrato TVDE). Quem
-- abria o ticket só sabia que estava resolvido se fosse lá ver — em 27
-- notificações de ticket já enviadas, nenhuma era de resolução.
--
-- Dispara na transição PARA 'resolvido', não em cada gravação de um ticket já
-- resolvido: sem isso, editar um ticket fechado mandava outro email.
--
-- Não avisa quem resolve o seu próprio ticket — receber um email a dizer o
-- que se acabou de fazer é ruído.
--
-- Falhar aqui não pode arrastar o ticket: um erro dentro de um trigger desfaz
-- a transação inteira, e foi assim que a severidade errada bloqueou as
-- assistências a 25/08 (ver notifications_severidade_check). Daí o bloco de
-- excepção — com a ressalva de que ele esconde erros: a primeira versão desta
-- função usava NEW.resolucao, coluna que não existe, e o aviso nunca era
-- criado sem nada visível. Ao mexer aqui, tirar o apanha-erros para testar.

CREATE OR REPLACE FUNCTION public.fn_ticket_resolvido_avisa_criador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_criador   record;
  v_matricula text;
  v_notif_id  uuid;
BEGIN
  IF NEW.status <> 'resolvido' OR coalesce(OLD.status, '') = 'resolvido' THEN
    RETURN NEW;
  END IF;

  IF NEW.criado_por IS NULL THEN
    RETURN NEW;
  END IF;

  -- Quem resolve o próprio ticket não precisa de aviso.
  IF NEW.criado_por = auth.uid() THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT p.id, p.nome, p.email INTO v_criador
      FROM public.profiles p WHERE p.id = NEW.criado_por;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    SELECT v.matricula INTO v_matricula
      FROM public.viaturas v WHERE v.id = NEW.viatura_id;

    INSERT INTO public.notifications
      (org_id, destinatario_user_id, template_codigo, severidade, titulo,
       mensagem, link, entity_table, entity_id, payload)
    VALUES (
      NEW.org_id,
      v_criador.id,
      'assistencia.ticket_resolvido_criador',
      -- notifications_severidade_check só aceita baixa/normal/alta/urgente.
      'normal',
      'O teu ticket foi resolvido',
      coalesce(nullif(btrim(NEW.titulo), ''), 'Ticket de assistência'),
      '/assistencia/' || NEW.id::text,
      'assistencia_tickets',
      NEW.id,
      jsonb_build_object(
        'numero',       coalesce(NEW.numero::text, '-'),
        'titulo',       coalesce(nullif(btrim(NEW.titulo), ''), 'Ticket de assistência'),
        'descricao',    coalesce(nullif(btrim(NEW.descricao), ''), '-'),
        'matricula',    coalesce(v_matricula, '-'),
        'criador_nome', coalesce(v_criador.nome, '-'),
        'link',         'https://wegest.pt/assistencia/' || NEW.id::text
      )
    )
    RETURNING id INTO v_notif_id;

    -- Sem email no perfil fica só o sino, como no aviso de abertura.
    IF v_criador.email IS NOT NULL AND btrim(v_criador.email) <> '' THEN
      INSERT INTO public.notification_queue
        (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
      SELECT v_notif_id, NEW.org_id, 'email', v_criador.email,
             'assistencia.ticket_resolvido_criador', n.payload
        FROM public.notifications n WHERE n.id = v_notif_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ticket_resolvido: falha ao avisar o criador do ticket %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.fn_ticket_resolvido_avisa_criador() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_ticket_resolvido_avisa_criador ON public.assistencia_tickets;
CREATE TRIGGER trg_ticket_resolvido_avisa_criador
  AFTER UPDATE OF status ON public.assistencia_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_ticket_resolvido_avisa_criador();

-- Template, para cada organização que já tem o do aviso de abertura — assim
-- nasce em todas as que usam assistência, não só na Década. Formato 'text' e
-- sem acentos no corpo, como o irmão.
INSERT INTO public.notification_templates
  (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato,
   variaveis_esperadas, versao, ativo)
SELECT DISTINCT
  t.org_id,
  'assistencia.ticket_resolvido_criador',
  'email',
  'pt-PT',
  'O teu ticket foi resolvido: {{titulo}}',
  'O ticket de assistencia que abriste foi marcado como resolvido.' || chr(10) || chr(10) ||
  'Ticket: #{{numero}}' || chr(10) ||
  'Assunto: {{titulo}}' || chr(10) ||
  'Viatura: {{matricula}}' || chr(10) || chr(10) ||
  'Descricao: {{descricao}}',
  'text',
  ARRAY['numero','titulo','matricula','descricao'],
  1,
  true
FROM public.notification_templates t
WHERE t.codigo = 'assistencia.ticket_aberto_gestor'
  AND NOT EXISTS (
    SELECT 1 FROM public.notification_templates x
     WHERE x.org_id = t.org_id
       AND x.codigo = 'assistencia.ticket_resolvido_criador'
  );
