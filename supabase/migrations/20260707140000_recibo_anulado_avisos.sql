-- ============================================================
-- Recibo anulado → avisos (email ao motorista + notificação ao gestor)
-- ============================================================
-- Quando um recibo passa de 'ativo' para 'anulado':
--   1. Cria uma notificação 'recibo_anulado' DIRIGIDA ao gestor responsável
--      pelo motorista (motoristas_ativos.gestor_responsavel → profiles.nome).
--   2. Dispara a edge function send-recibo-anulado-email (via pg_net) que envia
--      email ao motorista (com o motivo) e ao gestor.
--
-- Relações (verificadas na BD):
--   recibos.entidade_id → clientes.id
--   motoristas_ativos.cliente_id → clientes.id   (motorista dono do recibo)
--   motoristas_ativos.gestor_responsavel (texto = nome) → profiles.nome
--
-- O envio de email é best-effort e não bloqueia a anulação: se as settings de
-- pg_net não existirem, apenas a notificação é criada. Idempotente e aditiva.
-- ============================================================

-- 1. Aceitar o novo tipo 'recibo_anulado' no CHECK de notificacoes -----------
--    (Recria a constraint incluindo todos os tipos válidos até agora.)
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.notificacoes'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.notificacoes DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.notificacoes
    ADD CONSTRAINT notificacoes_tipo_check
    CHECK (tipo IN (
      'motorista_pendente',
      'escalonamento',
      'viatura_disponivel',
      'recibo_anulado'
    ));
END $$;

-- 2. Função do trigger -------------------------------------------------------
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
  -- Só reage à transição ativo → anulado.
  IF NOT (OLD.estado = 'ativo' AND NEW.estado = 'anulado') THEN
    RETURN NEW;
  END IF;

  -- Motorista dono do recibo (via cliente = entidade_id).
  SELECT m.nome, m.email, m.gestor_responsavel
    INTO v_motorista_nome, v_motorista_email, v_gestor_nome
  FROM public.motoristas_ativos m
  WHERE m.cliente_id = NEW.entidade_id
  LIMIT 1;

  -- Gestor responsável: resolve o nome (texto) para um utilizador em profiles.
  IF v_gestor_nome IS NOT NULL AND btrim(v_gestor_nome) <> '' THEN
    SELECT p.id, p.email
      INTO v_gestor_id, v_gestor_email
    FROM public.profiles p
    WHERE lower(btrim(p.nome)) = lower(btrim(v_gestor_nome))
      AND (NEW.org_id IS NULL OR p.org_id = NEW.org_id)
    LIMIT 1;
  END IF;

  v_motivo := NULLIF(btrim(COALESCE(NEW.observacoes, '')), '');

  -- 2a. Notificação dirigida ao gestor (se resolvido).
  IF v_gestor_id IS NOT NULL THEN
    INSERT INTO public.notificacoes (
      org_id, tipo, destinatario_user_id, titulo, mensagem, severidade, link
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

  -- 2b. Email (best-effort) via edge function — só se houver quem avisar.
  --     URL do projeto + anon key hardcoded: mesmo padrão dos crons de email
  --     que já correm neste projeto (a função tem verify_jwt=false, aceita anon;
  --     `app.settings.*` não estão configurados nesta BD). Fire-and-forget: se o
  --     pg_net falhar, a anulação e a notificação já ficaram feitas.
  IF v_motorista_email IS NOT NULL OR v_gestor_email IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/send-recibo-anulado-email',
      headers := jsonb_build_object(
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
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

-- 3. Trigger AFTER UPDATE do estado -----------------------------------------
DROP TRIGGER IF EXISTS trg_recibo_anulado_avisos ON public.recibos;
CREATE TRIGGER trg_recibo_anulado_avisos
  AFTER UPDATE OF estado ON public.recibos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_recibo_anulado_avisos();
