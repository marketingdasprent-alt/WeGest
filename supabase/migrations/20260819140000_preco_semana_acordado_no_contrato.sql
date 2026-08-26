-- ============================================================
-- O preço do aluguer congela no CONTRATO
-- ============================================================
-- REGRA (decidida a 2026-08-19)
--   A tarifa informa o contrato. O contrato manda no fecho.
--   Alterado à mão no contrato, é esse valor que vale.
--
-- O QUE ESTAVA MAL
-- O contrato era só um ponteiro: `contratos_renting.tarifa_id` →
-- `renting_tarifa_precos_modelo.preco_semana`. O preço vivia numa tabela
-- editável, portanto mexer nas tarifas reescrevia retroactivamente semanas
-- passadas. E havia dois caminhos independentes a resolver essa cascata: na
-- semana de 10–16/08/2026 o ecrã dava 51.854,90 EUR e o fecho 29.097,78 EUR.
--
-- O QUE MUDA
--   1. `preco_semana_acordado` no contrato — o preço, congelado.
--   2. Preenchido nos contratos que já existem, a partir da cascata actual,
--      para que nada mude de valor de repente.
--   3. Um gatilho preenche-o nos contratos novos, venham eles de onde vierem.
--      Fica na base de dados e não no código da aplicação de propósito: há
--      mais do que um caminho a criar contratos (interface, gerar_contrato_
--      atomico, importações), e uma regra guardada em memória de aplicação é
--      uma regra que um deles esquece.
--
-- A coluna fica NULLABLE: um contrato pode legitimamente não ter preço
-- semanal (rent-a-car ao dia, com `tarifa_diaria` ou `valor_total_manual`).
-- NULL quer dizer "não se resolve por aqui", e quem lê tem de tratar isso —
-- nunca converter para 0.
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS preco_semana_acordado numeric(12, 2);

COMMENT ON COLUMN public.contratos_renting.preco_semana_acordado IS
  'Preço semanal do aluguer, congelado no contrato. É esta a fonte de verdade '
  'do resumo e do fecho — nunca a tabela de tarifas, que é editável. '
  'Preenchido pelo gatilho trg_contrato_preco_acordado a partir da tarifa '
  'indicada, e alterável à mão. NULL = não se resolve por aqui (ex.: '
  'rent-a-car ao dia); quem lê tem de distinguir NULL de 0.';

-- ------------------------------------------------------------
-- A resolução, uma vez só, reutilizada pelo gatilho e pelo backfill
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_preco_semana_da_tarifa(
  p_tarifa_id uuid,
  p_viatura_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    -- 1) TVDE: o preço é por MODELO dentro da tarifa
    (SELECT pm.preco_semana
       FROM public.renting_tarifa_precos_modelo pm
       JOIN public.viaturas v ON v.id = p_viatura_id
      WHERE pm.tarifa_id = p_tarifa_id
        AND pm.modelo_id = v.modelo_id
        AND pm.preco_semana IS NOT NULL
      ORDER BY pm.id
      LIMIT 1),
    -- 2) Renting: o preço está na própria tarifa (de grupo)
    (SELECT t.preco_semana
       FROM public.renting_tarifas t
      WHERE t.id = p_tarifa_id
        AND t.preco_semana IS NOT NULL
      LIMIT 1)
  );
$$;

COMMENT ON FUNCTION public.fn_preco_semana_da_tarifa(uuid, uuid) IS
  'Resolve o preço semanal a partir da tarifa indicada: primeiro por modelo '
  '(TVDE), depois a tarifa de grupo. Usada para SEMEAR '
  'contratos_renting.preco_semana_acordado — nunca para o ler em tempo de '
  'leitura, que é justamente o que se quer deixar de fazer.';

-- ------------------------------------------------------------
-- Backfill dos contratos que já existem
-- ------------------------------------------------------------
-- Só onde está vazio, e só onde a cascata resolve. Congela o preço que o
-- sistema já usava, para nada mudar de valor por causa desta migração.
UPDATE public.contratos_renting c
   SET preco_semana_acordado = public.fn_preco_semana_da_tarifa(c.tarifa_id, c.viatura_id)
 WHERE c.preco_semana_acordado IS NULL
   AND c.tarifa_id IS NOT NULL
   AND c.deleted_at IS NULL
   AND public.fn_preco_semana_da_tarifa(c.tarifa_id, c.viatura_id) IS NOT NULL;

-- ------------------------------------------------------------
-- Os contratos novos nascem com o preço congelado
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_contrato_preco_acordado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Só semeia quando ninguém pôs valor. Um preço posto à mão — incluindo 0,
  -- que é um preço legítimo (viatura cedida, campanha) — nunca é tocado.
  IF NEW.preco_semana_acordado IS NULL AND NEW.tarifa_id IS NOT NULL THEN
    NEW.preco_semana_acordado :=
      public.fn_preco_semana_da_tarifa(NEW.tarifa_id, NEW.viatura_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_preco_acordado ON public.contratos_renting;
CREATE TRIGGER trg_contrato_preco_acordado
  BEFORE INSERT ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrato_preco_acordado();

COMMENT ON FUNCTION public.fn_contrato_preco_acordado() IS
  'Semeia preco_semana_acordado a partir da tarifa quando o contrato nasce '
  'sem preço. Só no INSERT: alterar a tarifa depois NÃO mexe num contrato já '
  'assinado — é esse justamente o ponto de congelar o preço.';

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================
-- SELECT count(*) FILTER (WHERE preco_semana_acordado IS NOT NULL) AS com_preco,
--        count(*) FILTER (WHERE preco_semana_acordado IS NULL)     AS sem_preco,
--        count(*) AS total
--   FROM contratos_renting WHERE deleted_at IS NULL;
