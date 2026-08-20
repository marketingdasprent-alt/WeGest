-- ============================================================
-- Backfill: fronteira temporal das trocas de viatura já feitas
-- ============================================================
-- Segunda parte de 20260820120000_troca_viatura_cadeia_rastreavel.sql, à parte
-- DE PROPÓSITO: aquela muda comportamento daqui para a frente e é inofensiva;
-- esta MEXE EM DADOS JÁ GRAVADOS. Corre-a só depois de conferires o dry-run.
--
-- O PROBLEMA QUE CORRIGE
-- Até agora nenhum caminho do código escrevia a fronteira da troca: o elo
-- antigo ficava `cancelado` mas com a `data_fim` original (ou NULL, em TVDE) e
-- o novo nascia com a `data_inicio` original. Os dois elos partilham o mesmo
-- intervalo. Consequências já observadas:
--   · motorista_viaturas com períodos sobrepostos (o caso de 10–16/08/2026
--     documentado em slotPeriodos.ts: 500 + 275 + 275 = 1.050 EUR numa semana);
--   · a semana da troca inteira imputada à viatura NOVA;
--   · portagens da viatura antiga a caírem em quem já a tinha devolvido.
--
-- A FRONTEIRA USADA
-- `substituido_em` do elo antigo — o instante em que a versão foi substituída,
-- que é o melhor registo que existe do momento da troca. Não é perfeito (se a
-- recolha física foi noutro dia, não há como sabê-lo retroactivamente), mas é
-- consistente e verificável, e acaba com a sobreposição.
--
-- ÂMBITO: só cadeias de TROCA DE VIATURA (viatura_id difere entre os elos).
-- Renovações ficam de fora — nessas, as datas já são as corretas por desenho.
--
-- TRIGGERS DESLIGADOS DURANTE O BACKFILL
--   · fn_contratos_renting_versao_imutavel congela versões substituídas e
--     recusaria o UPDATE (mesma razão pela qual
--     20260723150002_backfill_fecha_versoes_substituidas já fez isto);
--   · as cascatas de calendário reagem a data_fim/data_inicio e criariam ou
--     moveriam eventos de recolha para trocas antigas já resolvidas.
-- Tudo dentro de uma transacção: ou corre todo, ou não corre nada.
--
-- Idempotente: só toca elos cuja fronteira ainda esteja por fechar.
-- ============================================================

-- ------------------------------------------------------------
-- DRY-RUN — correr ISTO PRIMEIRO, sozinho, e conferir
-- ------------------------------------------------------------
-- SELECT a.codigo,
--        a.id            AS elo_antigo,
--        a.matricula     AS matricula_antiga,
--        a.data_inicio   AS antigo_inicio,
--        a.data_fim      AS antigo_fim_actual,
--        a.substituido_em AS fronteira_proposta,
--        b.id            AS elo_novo,
--        b.matricula     AS matricula_nova,
--        b.data_inicio   AS novo_inicio_actual,
--        b.data_fim      AS novo_fim
--   FROM public.contratos_renting a
--   JOIN public.contratos_renting b ON b.contrato_anterior_id = a.id
--  WHERE a.deleted_at IS NULL
--    AND b.deleted_at IS NULL
--    AND a.substituido_em IS NOT NULL
--    AND a.viatura_id IS DISTINCT FROM b.viatura_id
--    AND (a.data_fim IS NULL OR a.data_fim > a.substituido_em
--         OR b.data_inicio < a.substituido_em)
--  ORDER BY a.codigo, a.versao;
--
-- Confere sobretudo: `fronteira_proposta` cai dentro de
-- [antigo_inicio, novo_fim]? Se alguma linha tiver substituido_em anterior a
-- data_inicio (importações antigas), corrige-a à mão antes de continuar — o
-- WHERE abaixo já a exclui, mas fica por tratar.

BEGIN;

ALTER TABLE public.contratos_renting DISABLE TRIGGER USER;

-- ── 1) O elo antigo passa a fechar na troca ──────────────────
UPDATE public.contratos_renting a
   SET data_fim = a.substituido_em
  FROM public.contratos_renting b
 WHERE b.contrato_anterior_id = a.id
   AND a.deleted_at IS NULL
   AND b.deleted_at IS NULL
   AND a.substituido_em IS NOT NULL
   AND a.viatura_id IS DISTINCT FROM b.viatura_id
   AND a.substituido_em >= a.data_inicio          -- descarta datas incoerentes
   AND (a.data_fim IS NULL OR a.data_fim > a.substituido_em);

-- ── 2) O elo novo passa a abrir na troca ─────────────────────
UPDATE public.contratos_renting b
   SET data_inicio = a.substituido_em
  FROM public.contratos_renting a
 WHERE b.contrato_anterior_id = a.id
   AND a.deleted_at IS NULL
   AND b.deleted_at IS NULL
   AND a.substituido_em IS NOT NULL
   AND a.viatura_id IS DISTINCT FROM b.viatura_id
   AND a.substituido_em >= a.data_inicio
   AND b.data_inicio < a.substituido_em
   -- nunca empurrar o início para depois do fim do próprio elo
   AND (b.data_fim IS NULL OR a.substituido_em < b.data_fim);

ALTER TABLE public.contratos_renting ENABLE TRIGGER USER;

COMMIT;

-- ============================================================
-- VERIFICAÇÃO (depois de aplicar)
-- ============================================================
-- Não deve devolver nenhuma linha:
--   SELECT a.codigo, a.id, a.data_fim, b.id, b.data_inicio
--     FROM public.contratos_renting a
--     JOIN public.contratos_renting b ON b.contrato_anterior_id = a.id
--    WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
--      AND a.viatura_id IS DISTINCT FROM b.viatura_id
--      AND (a.data_fim IS NULL OR a.data_fim > b.data_inicio);
--
-- NOTA — motorista_viaturas NÃO é tocado aqui.
-- As sobreposições dessa tabela vêm dos triggers liga_motorista_{open,close}
-- (que usam NEW.data_inicio e CURRENT_DATE em vez da data da troca) e são um
-- problema com vida própria: a tabela não tem constraint anti-sobreposição nem
-- CHECK de datas, e há atribuições sobrepostas criadas por outros caminhos
-- (ex.: viatura substituta da Assistência, TicketDetails.tsx). Corrigi-las
-- exige decidir primeiro qual é a fonte de verdade — contrato ou atribuição —
-- e isso é decisão do dono do produto, não de um backfill.
