-- ============================================================
-- Motorista acede aos documentos do seu contrato (Viatura Atual)
-- ============================================================
-- Os documentos gerados na entrega (contrato de aluguer, prestação, etc.) são
-- guardados no bucket privado 'documentos', no caminho '{contrato_id}/….pdf'.
-- O motorista não tinha como lá chegar: a RLS de contratos_renting é só staff,
-- e não havia política de leitura no storage.
--
-- 1) RPC SECURITY DEFINER que devolve o contrato ACTIVO da viatura atual do
--    motorista autenticado (ignora a RLS de staff, mas só devolve o contrato
--    dele) — dá ao portal o contrato_id para listar os documentos.
-- 2) Política de storage: o motorista lê os objectos de 'documentos' cujas
--    pastas (contrato_id) pertencem a contratos onde ele é condutor — permite
--    listar e criar URLs assinadas para ver/descarregar/imprimir.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_motorista_contrato_ativo()
RETURNS TABLE (
  contrato_id uuid,
  codigo integer,
  regime text,
  matricula text,
  data_inicio timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.id, c.codigo::integer, c.regime::text, c.matricula, c.data_inicio
  FROM public.contratos_renting c
  JOIN public.contrato_condutores cc
    ON cc.contrato_id = c.id AND cc.motorista_id IS NOT NULL
  JOIN public.motoristas_ativos ma ON ma.id = cc.motorista_id
  JOIN public.motorista_viaturas mv
    ON mv.motorista_id = ma.id AND mv.viatura_id = c.viatura_id
   AND mv.status = 'ativo' AND mv.data_fim IS NULL
  WHERE ma.user_id = auth.uid()
    AND c.substituido_em IS NULL
    AND c.deleted_at IS NULL
    AND c.estado_operacional IN ('agendado', 'em_curso')
  ORDER BY c.data_inicio DESC
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_motorista_contrato_ativo() TO authenticated;

-- Storage: leitura dos documentos do(s) contrato(s) do próprio motorista.
DROP POLICY IF EXISTS "Motorista le documentos do seu contrato" ON storage.objects;
CREATE POLICY "Motorista le documentos do seu contrato"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documentos'
  AND (storage.foldername(name))[1] IN (
    SELECT c.id::text
    FROM public.contratos_renting c
    JOIN public.contrato_condutores cc ON cc.contrato_id = c.id
    JOIN public.motoristas_ativos ma ON ma.id = cc.motorista_id
    WHERE ma.user_id = (SELECT auth.uid())
      AND c.deleted_at IS NULL
  )
);
