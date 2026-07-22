-- ============================================================
-- Cartão de frota adicionado a um motorista → email de aviso
-- ============================================================
-- Sempre que um cartão de combustível é criado com motorista_id definido,
-- dispara a edge function send-cartao-frota-email (via pg_net) que avisa
-- marketing@dasprent.pt com nome/NIF do motorista, tipo, número e data.
--
-- AFTER INSERT (não UPDATE): só reage à criação do cartão, não a alterações
-- posteriores (troca de motorista, devolução, etc.). Um upsert de import em
-- massa que resolve para UPDATE (conflito em org_id,tipo,numero) não dispara
-- este trigger — só o INSERT genuíno de um cartão novo.
--
-- Best-effort: se pg_net falhar, a criação do cartão já ficou feita (o envio
-- nunca bloqueia nem reverte a transação).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_cartao_frota_email_aviso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motorista_nome text;
  v_motorista_nif  text;
BEGIN
  IF NEW.motorista_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.nome, m.nif
    INTO v_motorista_nome, v_motorista_nif
  FROM public.motoristas m
  WHERE m.id = NEW.motorista_id;

  PERFORM net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/send-cartao-frota-email',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'motoristaNome', v_motorista_nome,
      'motoristaNif', v_motorista_nif,
      'tipo', NEW.tipo,
      'numero', NEW.numero,
      'data', NEW.created_at
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cartao_frota_email_aviso ON public.cartoes_frota;
CREATE TRIGGER trg_cartao_frota_email_aviso
  AFTER INSERT ON public.cartoes_frota
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cartao_frota_email_aviso();
