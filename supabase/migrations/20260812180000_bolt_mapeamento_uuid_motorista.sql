-- ============================================================
-- Bolt: o UUID passa a ser a ligação ao motorista
-- ============================================================
-- Fecha a causa raiz da auditoria de 2026-08-12.
--
-- O PROBLEMA DO MODELO ANTIGO
-- `motoristas_ativos.bolt_id` guarda UM uuid. Mas a Bolt emite um uuid
-- novo sempre que o motorista sai da frota e volta, e outro por cada
-- conta da frota. Um motorista tem legitimamente vários — o João Varela
-- tem 4, o Ketan Arora 3 na mesma conta.
--
-- Como só cabia um, o sync caía no match por NOME para o resto. E o nome
-- que a Bolt devolve é curto ("Paulo Silva") — casou com a pessoa errada
-- e mandou ~14.400 € para contas-correntes alheias.
--
-- O MODELO NOVO
-- `bolt_mapeamento_motoristas` já existia com a forma certa e nunca foi
-- usada: UNIQUE (driver_uuid), FK para motoristas_ativos. Ou seja, um
-- uuid pertence a um motorista, e um motorista pode ter N uuids — que é
-- exactamente a realidade.
--
-- O QUE ESTA MIGRAÇÃO FAZ
-- Semeia o mapa a partir do histórico já atribuído: 432 dos 437 uuids
-- conhecidos apontam, sem ambiguidade, para um único motorista.
--
-- Os 5 restantes (o mesmo uuid atribuído a dois motoristas ao longo do
-- tempo) ficam DE FORA de propósito. São precisamente os casos em que o
-- match por nome errou; adivinhar aqui repetiria o erro. Vão aparecer
-- como "por ligar" para alguém decidir com conhecimento de causa.
--
-- `auto_mapped = true` marca que a ligação vem do histórico e não de uma
-- confirmação humana — serve para, mais tarde, se poder pedir revisão.
-- ============================================================

BEGIN;

WITH pares AS (
  SELECT r.identificador_motorista AS uuid, r.motorista_id, count(*) AS n
    FROM public.bolt_resumos_semanais r
   WHERE r.motorista_id IS NOT NULL
     AND r.identificador_motorista IS NOT NULL
   GROUP BY 1, 2
),
-- Só os uuids que sempre apontaram para o MESMO motorista.
limpos AS (
  SELECT uuid FROM pares GROUP BY uuid HAVING count(*) = 1
),
escolha AS (
  SELECT DISTINCT ON (p.uuid) p.uuid, p.motorista_id
    FROM pares p JOIN limpos l ON l.uuid = p.uuid
   ORDER BY p.uuid, p.n DESC
),
-- Nome/telefone/integração mais recentes que a Bolt reportou para o uuid.
contexto AS (
  SELECT DISTINCT ON (r.identificador_motorista)
         r.identificador_motorista AS uuid, r.integracao_id, r.org_id,
         r.motorista_nome, r.telefone
    FROM public.bolt_resumos_semanais r
   WHERE r.identificador_motorista IS NOT NULL
   ORDER BY r.identificador_motorista, r.periodo_inicio DESC
)
INSERT INTO public.bolt_mapeamento_motoristas
  (driver_uuid, driver_name, driver_phone, motorista_id, integracao_id, org_id, auto_mapped)
SELECT e.uuid, c.motorista_nome, c.telefone, e.motorista_id, c.integracao_id, c.org_id, true
  FROM escolha e
  JOIN contexto c ON c.uuid = e.uuid
ON CONFLICT (driver_uuid) DO NOTHING;

COMMENT ON TABLE public.bolt_mapeamento_motoristas IS
  'Ligação uuid Bolt -> motorista WeGest. UNIQUE(driver_uuid): um uuid pertence '
  'a um motorista; um motorista pode ter N uuids (sai da frota e volta com outro, '
  'ou tem um por conta da frota). É a fonte de verdade do sync — motoristas_ativos.bolt_id '
  'fica como o último uuid conhecido, para compatibilidade. Semeada em 2026-08-12.';

COMMENT ON COLUMN public.bolt_mapeamento_motoristas.auto_mapped IS
  'true = ligação derivada do histórico ao semear o mapa; false = confirmada por uma pessoa.';

COMMIT;
