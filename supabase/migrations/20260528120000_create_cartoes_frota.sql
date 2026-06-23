-- Cartões de frota: BP, Repsol, EDP
-- Associação ao motorista feita via ficha do motorista (campo cartao_bp/cartao_repsol/cartao_edp)
-- Este registo serve como master dos cartões físicos existentes

CREATE TABLE IF NOT EXISTS public.cartoes_frota (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT get_current_org_id(),
  numero        text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('bp', 'repsol', 'edp')),
  motorista_id  uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  ativo         boolean NOT NULL DEFAULT true,
  data_validade date,
  notas         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, tipo, numero)
);

ALTER TABLE public.cartoes_frota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cartoes_frota_all" ON public.cartoes_frota
  FOR ALL TO authenticated
  USING (org_id = get_current_org_id())
  WITH CHECK (org_id = get_current_org_id());

-- Atualizar updated_at automaticamente
CREATE OR REPLACE TRIGGER trg_cartoes_frota_updated_at
  BEFORE UPDATE ON public.cartoes_frota
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_cartoes_frota_motorista ON public.cartoes_frota (motorista_id);
CREATE INDEX IF NOT EXISTS idx_cartoes_frota_tipo      ON public.cartoes_frota (tipo);

-- Ao associar um cartão a um motorista, sincroniza o campo cartao_bp/cartao_repsol/cartao_edp
-- na tabela motoristas_ativos (e limpa o campo no motorista anterior se houver troca)
CREATE OR REPLACE FUNCTION public.sync_cartao_frota_motorista()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  col text;
BEGIN
  col := CASE NEW.tipo
    WHEN 'bp'     THEN 'cartao_bp'
    WHEN 'repsol' THEN 'cartao_repsol'
    WHEN 'edp'    THEN 'cartao_edp'
  END;

  -- Limpar no motorista anterior (se mudou)
  IF OLD.motorista_id IS NOT NULL AND OLD.motorista_id IS DISTINCT FROM NEW.motorista_id THEN
    EXECUTE format('UPDATE public.motoristas_ativos SET %I = NULL WHERE id = $1 AND %I = $2', col, col)
      USING OLD.motorista_id, OLD.numero;
  END IF;

  -- Atribuir ao novo motorista
  IF NEW.motorista_id IS NOT NULL THEN
    EXECUTE format('UPDATE public.motoristas_ativos SET %I = $1 WHERE id = $2', col)
      USING NEW.numero, NEW.motorista_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_sync_cartao_motorista
  AFTER INSERT OR UPDATE OF motorista_id, numero ON public.cartoes_frota
  FOR EACH ROW EXECUTE FUNCTION public.sync_cartao_frota_motorista();

GRANT ALL ON public.cartoes_frota TO authenticated;
