-- O motorista só vê o resumo da semana depois de o escritório o enviar
-- (WhatsApp, e-mail ou perfil da app). Pedido de 09/11/2026: até aqui o valor
-- aparecia no portal mal alguém abria a semana nos Resumos.

ALTER TABLE public.motorista_liquido_semanal
  ADD COLUMN IF NOT EXISTS enviado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enviado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enviado_canais TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.motorista_liquido_semanal
  DROP CONSTRAINT IF EXISTS motorista_liquido_semanal_enviado_canais_validos;
ALTER TABLE public.motorista_liquido_semanal
  ADD CONSTRAINT motorista_liquido_semanal_enviado_canais_validos
  CHECK (enviado_canais <@ ARRAY['whatsapp', 'email', 'app']::TEXT[]);

-- As semanas anteriores à de 02/11 já estavam à vista: não desaparecem do portal.
UPDATE public.motorista_liquido_semanal
   SET enviado_em = COALESCE(gravado_em, NOW())
 WHERE enviado_em IS NULL
   AND semana_inicio < DATE '2026-11-02';

-- Motorista: só as semanas enviadas.
DROP POLICY IF EXISTS liquido_semanal_motorista_ve_os_seus ON public.motorista_liquido_semanal;
CREATE POLICY liquido_semanal_motorista_ve_os_seus ON public.motorista_liquido_semanal
  FOR SELECT TO authenticated
  USING (
    enviado_em IS NOT NULL
    AND motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma WHERE ma.user_id = (SELECT auth.uid())
    )
  );

-- O movimento 'resumos' de uma semana por enviar também fica escondido (senão o
-- valor aparecia nos Movimentos e no saldo antes do envio).
DROP POLICY IF EXISTS "Motorista ve os seus movimentos" ON public.motorista_financeiro;
CREATE POLICY "Motorista ve os seus movimentos" ON public.motorista_financeiro
  FOR SELECT TO authenticated
  USING (
    motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma WHERE ma.user_id = (SELECT auth.uid())
    )
    AND (
      liquido_semanal_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.motorista_liquido_semanal l
         WHERE l.id = motorista_financeiro.liquido_semanal_id
           AND l.enviado_em IS NOT NULL
      )
    )
  );

-- Marca a semana como enviada. Corre com as permissões de quem chama: só
-- actualiza o que a política de gestão dos resumos já deixa actualizar.
CREATE OR REPLACE FUNCTION public.marcar_resumos_enviados(
  p_motorista_ids UUID[],
  p_semana_inicio DATE,
  p_canal TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  IF p_canal NOT IN ('whatsapp', 'email', 'app') THEN
    RAISE EXCEPTION 'canal inválido: %', p_canal USING ERRCODE = '22023';
  END IF;

  UPDATE public.motorista_liquido_semanal
     SET enviado_em = COALESCE(enviado_em, NOW()),
         enviado_por = COALESCE(enviado_por, auth.uid()),
         enviado_canais = CASE
           WHEN p_canal = ANY (enviado_canais) THEN enviado_canais
           ELSE enviado_canais || p_canal
         END
   WHERE motorista_id = ANY (p_motorista_ids)
     AND semana_inicio = p_semana_inicio;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_resumos_enviados(UUID[], DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_resumos_enviados(UUID[], DATE, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
