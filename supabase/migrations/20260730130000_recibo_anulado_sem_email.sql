-- supabase/migrations/20260730130000_recibo_anulado_sem_email.sql
-- ============================================================
-- Recibo anulado: já não envia email ao motorista/gestor
-- ============================================================
-- Pedido explícito do utilizador (30/07/2026): não quer que o motivo de
-- anulação de um recibo seja enviado por email a ninguém — nem ao
-- motorista, nem ao gestor. Remove o disparo (via pg_net) à edge function
-- send-recibo-anulado-email. Mantém a notificação interna (in-app, não
-- email) ao gestor responsável — não é o que foi pedido para remover, e
-- continua a dar visibilidade administrativa sem sair da aplicação.

CREATE OR REPLACE FUNCTION public.fn_recibo_anulado_avisos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motorista_nome text;
  v_gestor_nome text;
  v_gestor_id uuid;
  v_motivo text;
BEGIN
  IF NOT (OLD.estado = 'ativo' AND NEW.estado = 'anulado') THEN
    RETURN NEW;
  END IF;

  SELECT m.nome, m.gestor_responsavel
    INTO v_motorista_nome, v_gestor_nome
  FROM public.motoristas_ativos m
  WHERE m.cliente_id = NEW.entidade_id
  LIMIT 1;

  IF v_gestor_nome IS NOT NULL AND btrim(v_gestor_nome) <> '' THEN
    SELECT p.id INTO v_gestor_id
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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_recibo_anulado_avisos() IS
  'Ao anular um recibo, cria só uma notificação interna (in-app) ao gestor '
  'responsável — já não envia email a ninguém (removido a pedido em '
  '30/07/2026; a versão anterior enviava email ao motorista e ao gestor '
  'via send-recibo-anulado-email).';
