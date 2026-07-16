-- ============================================================
-- Recibo anulado: passar org_id no payload do pg_net
-- ============================================================
-- send-recibo-anulado-email foi migrada para o EmailService, que resolve a
-- integração de email pela org (EmailProviderFactory) — precisa de org_id no
-- corpo do pedido, que o trigger antigo não enviava. Idempotente: apenas
-- recria a função com o campo adicional, resto do trigger inalterado.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_recibo_anulado_avisos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motorista_nome text;
  v_motorista_email text;
  v_gestor_nome text;
  v_gestor_id uuid;
  v_gestor_email text;
  v_motivo text;
BEGIN
  IF NOT (OLD.estado = 'ativo' AND NEW.estado = 'anulado') THEN
    RETURN NEW;
  END IF;

  SELECT m.nome, m.email, m.gestor_responsavel
    INTO v_motorista_nome, v_motorista_email, v_gestor_nome
  FROM public.motoristas_ativos m
  WHERE m.cliente_id = NEW.entidade_id
  LIMIT 1;

  IF v_gestor_nome IS NOT NULL AND btrim(v_gestor_nome) <> '' THEN
    SELECT p.id, p.email
      INTO v_gestor_id, v_gestor_email
    FROM public.profiles p
    WHERE lower(btrim(p.nome)) = lower(btrim(v_gestor_nome))
      AND (NEW.org_id IS NULL OR p.org_id = NEW.org_id)
    LIMIT 1;
  END IF;

  v_motivo := NULLIF(btrim(COALESCE(NEW.observacoes, '')), '');

  IF v_gestor_id IS NOT NULL THEN
    INSERT INTO public.notificacoes (
      org_id, tipo, destinatario_id, titulo, mensagem, severidade, link
    )
    VALUES (
      NEW.org_id,
      'recibo_anulado',
      v_gestor_id,
      'Recibo anulado: nº ' || NEW.codigo,
      'O recibo nº ' || NEW.codigo || ' do motorista ' ||
        COALESCE(v_motorista_nome, 'desconhecido') || ' foi anulado' ||
        CASE WHEN v_motivo IS NOT NULL THEN ' (' || v_motivo || ')' ELSE '' END || '.',
      'normal',
      '/administrativo'
    );
  END IF;

  IF v_motorista_email IS NOT NULL OR v_gestor_email IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/send-recibo-anulado-email',
      headers := jsonb_build_object(
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'orgId', NEW.org_id,
        'reciboCodigo', NEW.codigo,
        'valor', NEW.valor,
        'motivo', v_motivo,
        'motoristaEmail', v_motorista_email,
        'motoristaNome', v_motorista_nome,
        'gestorEmail', v_gestor_email,
        'gestorNome', v_gestor_nome
      )
    );
  END IF;

  RETURN NEW;
END;
$$;
