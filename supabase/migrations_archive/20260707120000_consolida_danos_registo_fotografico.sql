-- ============================================================
-- Consolida danos de "Registo entrega/recolha" duplicados (1 por foto) num
-- único registo por lote (uma galeria de fotos)
-- ============================================================
-- Contexto:
--   Os fluxos de entrega/recolha (RealizarEntregaPage, useContratosRenting)
--   criavam ANTES um registo `viatura_danos` por CADA foto, gerando dezenas de
--   cartões "Registo recolha"/"Registo entrega" com uma só foto cada. O código
--   já foi corrigido para agrupar as fotos num único dano; esta migração
--   reconcilia os dados HISTÓRICOS que ficaram fragmentados.
--
-- Estratégia:
--   Agrupa por (viatura, contrato, descrição, autor) em LOTES separados por
--   intervalos > 5 min no created_at (cada recolha/entrega demora segundos;
--   recolhas distintas ficam minutos/horas/dias à parte). Mantém o dano mais
--   antigo de cada lote como "keeper", re-aponta as fotos dos restantes para
--   ele e apaga os danos agora vazios.
--
-- Segurança:
--   Só toca em danos SEM valor (valor = 0/NULL). Danos com valor, movimento
--   financeiro, cobrança ou reparação associados NÃO são fundidos (os batch
--   danos não têm nenhum destes — verificado). As fotos são re-apontadas ANTES
--   do delete, por isso nenhuma foto se perde.
--
-- Idempotente: depois de correr, deixa de haver lotes com > 1 dano, portanto
-- uma segunda execução não altera nada.
-- ============================================================

WITH base AS (
  SELECT id, viatura_id, contrato_renting_id, descricao, registado_por, created_at,
    lag(created_at) OVER (
      PARTITION BY viatura_id, contrato_renting_id, descricao, registado_por
      ORDER BY created_at
    ) AS prev_created
  FROM public.viatura_danos
  WHERE descricao IN ('Registo recolha', 'Registo entrega')
    AND registo_fotografico = false
    AND coalesce(valor, 0) = 0
),
flagged AS (
  SELECT *,
    CASE WHEN prev_created IS NULL
           OR created_at - prev_created > interval '5 minutes'
         THEN 1 ELSE 0 END AS new_batch
  FROM base
),
numbered_final AS (
  SELECT id, viatura_id, contrato_renting_id, descricao, registado_por, created_at,
    sum(new_batch) OVER (
      PARTITION BY viatura_id, contrato_renting_id, descricao, registado_por
      ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS batch_no
  FROM flagged
),
batches AS (
  SELECT id,
    first_value(id) OVER (
      PARTITION BY viatura_id, contrato_renting_id, descricao, registado_por, batch_no
      ORDER BY created_at
    ) AS keeper_id,
    count(*) OVER (
      PARTITION BY viatura_id, contrato_renting_id, descricao, registado_por, batch_no
    ) AS batch_size
  FROM numbered_final
),
to_merge AS (
  SELECT id, keeper_id FROM batches WHERE batch_size > 1 AND id <> keeper_id
),
repointed AS (
  UPDATE public.viatura_dano_fotos f
  SET dano_id = m.keeper_id
  FROM to_merge m
  WHERE f.dano_id = m.id
  RETURNING f.id
)
DELETE FROM public.viatura_danos d
USING to_merge m
WHERE d.id = m.id;
