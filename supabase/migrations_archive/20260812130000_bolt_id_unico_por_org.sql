-- ============================================================
-- Bolt ID: limpar fichas duplicadas e impedir nova corrupção
-- ============================================================
-- Auditoria de 2026-08-12, a partir do aviso do sync semanal
-- ("1 motoristas da WeGest ligados a mais do que uma identidade Bolt").
--
-- ESTADO ENCONTRADO: 18 valores de `motoristas_ativos.bolt_id` estavam em
-- DUAS fichas cada — 36 registos, todos na Década Ousada. Não havia nada
-- na BD a impedi-lo.
--
-- COMO ACONTECEU: quando a ligação por bolt_id falha, o sync cai para o
-- match por NOME (`matcher.encontrar`). A Bolt devolve nomes curtos
-- ("Paulo Silva", "Rafael Silva") que casam com mais do que um nome
-- completo da WeGest. O sync carimbava então o bolt_id na ficha errada.
--
-- CONSEQUÊNCIA: 5 identidades Bolt foram creditadas a dois motoristas
-- WeGest diferentes ao longo do tempo (16.978,63 € líquidos). Este
-- ficheiro NÃO re-atribui histórico — só corrige as fichas para que o
-- futuro fique certo. A revisão do histórico é decisão do negócio.
--
-- REGRA DE DESEMPATE (por evidência, não por nome):
--   1. Fica com o bolt_id quem mais resumos tem GRAVADOS sob esse uuid —
--      é o registo de quem realmente recebeu o dinheiro.
--   2. O outro passa a ter o SEU uuid dominante (o que aparece nos
--      resumos dele), ou NULL se nunca teve nenhum.
-- Preserva a atribuição actual; apenas desfaz a colisão.
--
-- Exemplo: Agnelo Tavares (#283) tinha o uuid do César Martins. Nunca
-- ganhou nada sob ele — os 13 resumos dele são sob 213faa3e. Passa a ter
-- 213faa3e; o César fica com o que sempre foi dele.
-- ============================================================

BEGIN;

WITH dup AS (
  SELECT org_id, bolt_id
    FROM public.motoristas_ativos
   WHERE bolt_id IS NOT NULL
   GROUP BY org_id, bolt_id
  HAVING count(*) > 1
),
posse AS (
  SELECT m.id, m.org_id, m.bolt_id,
         (SELECT count(*) FROM public.bolt_resumos_semanais r
           WHERE r.motorista_id = m.id
             AND r.identificador_motorista = m.bolt_id) AS linhas_sob_uuid
    FROM public.motoristas_ativos m
    JOIN dup d ON d.org_id = m.org_id AND d.bolt_id = m.bolt_id
),
vencedor AS (
  SELECT DISTINCT ON (org_id, bolt_id) id
    FROM posse
   ORDER BY org_id, bolt_id, linhas_sob_uuid DESC, id
),
proprio AS (
  SELECT motorista_id, identificador_motorista FROM (
    SELECT r.motorista_id, r.identificador_motorista,
           row_number() OVER (
             PARTITION BY r.motorista_id
             ORDER BY count(*) DESC, r.identificador_motorista
           ) AS rn
      FROM public.bolt_resumos_semanais r
      JOIN posse p ON p.id = r.motorista_id
     WHERE r.identificador_motorista IS DISTINCT FROM p.bolt_id
       AND r.identificador_motorista IS NOT NULL
     GROUP BY r.motorista_id, r.identificador_motorista
  ) t WHERE rn = 1
)
UPDATE public.motoristas_ativos m
   SET bolt_id = pr.identificador_motorista, updated_at = now()
  FROM posse p
  LEFT JOIN proprio pr ON pr.motorista_id = p.id
 WHERE m.id = p.id
   AND p.id NOT IN (SELECT id FROM vencedor);

-- Salvaguarda: se ainda houver colisões, aborta antes de criar o índice
-- (a criação falharia na mesma, mas com um erro muito menos legível).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT org_id, bolt_id FROM public.motoristas_ativos
     WHERE bolt_id IS NOT NULL
     GROUP BY org_id, bolt_id HAVING count(*) > 1) x;
  IF n > 0 THEN
    RAISE EXCEPTION 'Ainda existem % bolt_id duplicados — índice único não pode ser criado', n;
  END IF;
END $$;

-- A rede de segurança que faltava. A partir daqui, carimbar um bolt_id
-- que já pertence a outra ficha da mesma org falha em voz alta em vez de
-- corromper em silêncio. O sync já trata o erro (regista aviso e segue).
CREATE UNIQUE INDEX IF NOT EXISTS motoristas_ativos_bolt_id_unico_por_org
  ON public.motoristas_ativos (org_id, bolt_id)
  WHERE bolt_id IS NOT NULL;

COMMENT ON INDEX public.motoristas_ativos_bolt_id_unico_por_org IS
  'Uma identidade Bolt pertence a um único motorista dentro da organização. '
  'Criado após a auditoria de 2026-08-12, que encontrou 18 bolt_id em duas fichas cada.';

COMMIT;
