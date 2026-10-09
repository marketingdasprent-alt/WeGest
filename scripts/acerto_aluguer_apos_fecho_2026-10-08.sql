-- Acerto do aluguer cobrado depois do fim do contrato (2026-10-08).
--
-- Corre UMA vez, inteiro, numa só transacção (sem BEGIN/COMMIT: o execute_sql
-- já trata a string como uma transacção). Inclui a migração
-- 20261008160000_tvde_fechado_guarda_data_fim, porque o plano tem de ver os
-- contratos AINDA sem data_fim; aplicada depois, a migração não faz nada.
--
-- Ensaio: acrescentar no fim o bloco ENSAIO (ver final do ficheiro).
-- Desfazer: private.acerto_aluguer_2026_10_08 guarda cada valor antes/depois.

DO $$
BEGIN
  IF to_regclass('private.acerto_aluguer_2026_10_08') IS NOT NULL THEN
    RAISE EXCEPTION 'Este acerto já foi aplicado (private.acerto_aluguer_2026_10_08 existe).';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 1. Plano — calculado com os contratos ainda sem data_fim
-- ════════════════════════════════════════════════════════════

-- Os contratos maus e a data que vão receber (a mesma regra da migração).
CREATE TEMP TABLE acerto_bad ON COMMIT DROP AS
WITH g2 AS (
  SELECT c.id, c.data_inicio, c.updated_at,
    (SELECT max(e.data_inicio) FROM calendario_eventos e
      WHERE e.origem_tipo = 'contrato_renting' AND e.origem_id = c.id AND e.tipo = 'recolha') rec,
    (SELECT max(h.criado_em) FROM contrato_historico h
      WHERE h.contrato_id = c.id AND h.evento_tipo = 'contrato_aberto'
        AND h.detalhe ~ '^(fechado|cancelado|devolvido) → ') reaberto
  FROM contratos_renting c
  WHERE c.deleted_at IS NULL AND c.regime = 'tvde' AND c.substituido_em IS NULL
    AND c.estado_operacional = 'fechado' AND c.data_fim IS NULL
),
bad AS (
  SELECT c.id, 1 grupo, greatest(c.substituido_em, c.data_inicio + interval '1 second') nova_fim
    FROM contratos_renting c
   WHERE c.deleted_at IS NULL AND c.regime = 'tvde' AND c.substituido_em IS NOT NULL AND c.data_fim IS NULL
  UNION ALL
  SELECT g.id, 2, greatest(g.data_inicio + interval '1 second', CASE
      WHEN g.rec IS NOT NULL AND (g.reaberto IS NULL OR g.reaberto <= g.rec + interval '10 minutes') THEN g.rec
      ELSE coalesce((SELECT max(h.criado_em) FROM contrato_historico h
                      WHERE h.contrato_id = g.id AND h.evento_tipo = 'contrato_fechado'
                        AND h.criado_em >= coalesce(g.reaberto, '-infinity')), g.rec, g.updated_at)
    END)
  FROM g2 g
)
SELECT b.id, b.grupo, b.nova_fim, c.codigo, c.org_id, c.viatura_id,
       (c.data_inicio AT TIME ZONE 'UTC')::date ini,
       (b.nova_fim AT TIME ZONE 'UTC')::date fim_novo,
       -- Preço que o fecho semanal usa (fechar-semana-financeiro).
       coalesce(nullif((SELECT t.preco_semana FROM renting_tarifas t WHERE t.id = c.tarifa_id), 0),
                (SELECT p.preco_semana FROM renting_tarifa_precos_modelo p
                  WHERE p.tarifa_id = c.tarifa_id AND p.modelo_id = v.modelo_id), 0)::numeric preco_fecho
  FROM bad b
  JOIN contratos_renting c ON c.id = b.id
  LEFT JOIN viaturas v ON v.id = c.viatura_id;

CREATE TEMP TABLE acerto_mot ON COMMIT DROP AS
SELECT DISTINCT cc.motorista_id
  FROM contrato_condutores cc JOIN acerto_bad b ON b.id = cc.contrato_id
 WHERE cc.motorista_id IS NOT NULL;

-- Contratos destes motoristas, com o preço de cada um nos dois ecrãs.
CREATE TEMP TABLE acerto_ct ON COMMIT DROP AS
WITH pm AS (
  SELECT p.tarifa_id, p.modelo_id, p.preco_semana::numeric preco
    FROM renting_tarifa_precos_modelo p JOIN renting_tarifas t ON t.id = p.tarifa_id
   WHERE t.tipo = 'tvde' AND t.ativa AND p.preco_semana IS NOT NULL
),
pmo AS (SELECT DISTINCT ON (modelo_id) modelo_id, preco FROM pm ORDER BY modelo_id, preco, tarifa_id),
pt AS (SELECT id, preco_semana::numeric preco FROM renting_tarifas WHERE ativa AND preco_semana IS NOT NULL),
pg AS (
  SELECT DISTINCT ON (grupo_id) grupo_id, preco_semana::numeric preco FROM renting_tarifas
   WHERE ativa AND preco_semana IS NOT NULL AND grupo_id IS NOT NULL ORDER BY grupo_id, preco_semana
)
SELECT c.id, c.viatura_id, c.versao, c.substituido_em,
  (c.data_inicio AT TIME ZONE 'UTC')::date ini,
  (c.data_fim AT TIME ZONE 'UTC')::date fim_antes,
  coalesce(b.fim_novo, (c.data_fim AT TIME ZONE 'UTC')::date) fim_depois,
  b.id IS NOT NULL mau,
  -- periodosDeContratos (lista de Contas/Resumo, de onde sai o líquido).
  CASE WHEN c.regime::text <> 'tvde' AND c.valor_total_manual IS NOT NULL AND c.data_fim IS NOT NULL
       THEN c.valor_total_manual / greatest(1, ((c.data_fim AT TIME ZONE 'UTC')::date
                                             - (c.data_inicio AT TIME ZONE 'UTC')::date) + 1) * 7
       ELSE coalesce(ptm.preco, ptt.preco, pgg.preco, pmm.preco) END preco_lista,
  coalesce(nullif((SELECT t.preco_semana FROM renting_tarifas t WHERE t.id = c.tarifa_id), 0),
           (SELECT p.preco_semana FROM renting_tarifa_precos_modelo p
             WHERE p.tarifa_id = c.tarifa_id AND p.modelo_id = v.modelo_id), 0)::numeric preco_fecho
FROM contratos_renting c
LEFT JOIN acerto_bad b ON b.id = c.id
LEFT JOIN viaturas v ON v.id = c.viatura_id
LEFT JOIN pm ptm ON ptm.tarifa_id = c.tarifa_id AND ptm.modelo_id = v.modelo_id
LEFT JOIN pt ptt ON ptt.id = c.tarifa_id
LEFT JOIN pg pgg ON pgg.grupo_id = v.grupo_id
LEFT JOIN pmo pmm ON pmm.modelo_id = v.modelo_id
WHERE c.deleted_at IS NULL AND c.viatura_id IS NOT NULL AND c.data_inicio IS NOT NULL
  AND (c.estado_operacional <> 'cancelado' OR c.substituido_em IS NOT NULL)
  AND EXISTS (SELECT 1 FROM contrato_condutores cc JOIN acerto_mot m USING (motorista_id)
               WHERE cc.contrato_id = c.id);

-- Aluguer da lista por motorista e semana gravada, antes e depois.
-- buildSlotPeriodos: o dia fica com a viatura de início mais recente.
CREATE TEMP TABLE acerto_lista ON COMMIT DROP AS
WITH sem AS (
  SELECT DISTINCT l.motorista_id, l.semana_inicio, l.semana_fim
    FROM motorista_liquido_semanal l JOIN acerto_mot USING (motorista_id)
),
cand AS (
  SELECT s.motorista_id, s.semana_inicio, d::date dia, ct.id cid, ct.ini, ct.viatura_id,
         ct.preco_lista / (s.semana_fim - s.semana_inicio + 1) taxa,
         d::date <= coalesce(ct.fim_antes, 'infinity') cobre_antes,
         d::date <= coalesce(ct.fim_depois, 'infinity') cobre_depois
    FROM sem s
    CROSS JOIN LATERAL generate_series(s.semana_inicio, s.semana_fim, interval '1 day') d
    JOIN (SELECT DISTINCT contrato_id, motorista_id FROM contrato_condutores) cc ON cc.motorista_id = s.motorista_id
    JOIN acerto_ct ct ON ct.id = cc.contrato_id
   WHERE ct.preco_lista > 0 AND d::date >= ct.ini + 1
),
antes AS (
  SELECT DISTINCT ON (motorista_id, semana_inicio, dia) motorista_id, semana_inicio, dia, taxa
    FROM cand WHERE cobre_antes ORDER BY motorista_id, semana_inicio, dia, ini DESC, viatura_id, cid
),
depois AS (
  SELECT DISTINCT ON (motorista_id, semana_inicio, dia) motorista_id, semana_inicio, dia, taxa
    FROM cand WHERE cobre_depois ORDER BY motorista_id, semana_inicio, dia, ini DESC, viatura_id, cid
)
SELECT coalesce(a.motorista_id, d.motorista_id) motorista_id,
       coalesce(a.semana_inicio, d.semana_inicio) semana_inicio,
       round(coalesce(sum(a.taxa), 0), 2) aluguer_antes,
       round(coalesce(sum(d.taxa), 0), 2) aluguer_depois
  FROM antes a FULL JOIN depois d USING (motorista_id, semana_inicio, dia)
 GROUP BY 1, 2;

-- Dias de cada contrato no fecho semanal, antes e depois.
-- reivindicarDiasPorContrato: vivo primeiro, versão mais alta, depois id.
-- O fecho conta do primeiro ao último dia reivindicado.
CREATE TEMP TABLE acerto_fecho ON COMMIT DROP AS
WITH sem AS (
  SELECT DISTINCT r.semana_inicio, r.semana_fim FROM motorista_resumo_semanal r JOIN acerto_mot USING (motorista_id)
),
cand AS (
  SELECT s.semana_inicio, s.semana_fim, d::date dia, ct.id cid, ct.mau, ct.preco_fecho, lv.motorista_id,
         ct.substituido_em IS NULL vivo, coalesce(ct.versao, 0) versao,
         d::date <= coalesce(ct.fim_antes, 'infinity') cobre_antes,
         d::date <= coalesce(ct.fim_depois, 'infinity') cobre_depois
    FROM sem s
    CROSS JOIN LATERAL generate_series(s.semana_inicio, s.semana_fim, interval '1 day') d
    JOIN acerto_ct ct ON d::date >= ct.ini + 1
    CROSS JOIN LATERAL (
      SELECT cc.motorista_id FROM contrato_condutores cc
       WHERE cc.contrato_id = ct.id AND cc.is_principal
         AND cc.data_inicio < (s.semana_fim + 1) AND (cc.data_fim IS NULL OR cc.data_fim >= s.semana_inicio)
       ORDER BY cc.data_inicio DESC LIMIT 1) lv
   WHERE lv.motorista_id IN (SELECT motorista_id FROM acerto_mot)
),
antes AS (
  SELECT DISTINCT ON (semana_inicio, semana_fim, motorista_id, dia) * FROM cand
   WHERE cobre_antes ORDER BY semana_inicio, semana_fim, motorista_id, dia, vivo DESC, versao DESC, cid
),
depois AS (
  SELECT DISTINCT ON (semana_inicio, semana_fim, motorista_id, dia) * FROM cand
   WHERE cobre_depois ORDER BY semana_inicio, semana_fim, motorista_id, dia, vivo DESC, versao DESC, cid
),
claims AS (
  SELECT semana_inicio, semana_fim, motorista_id, cid, mau, preco_fecho, 'antes' quando,
         max(dia) - min(dia) + 1 dias FROM antes GROUP BY 1, 2, 3, 4, 5, 6
  UNION ALL
  SELECT semana_inicio, semana_fim, motorista_id, cid, mau, preco_fecho, 'depois',
         max(dia) - min(dia) + 1 FROM depois GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT semana_inicio, semana_fim, motorista_id, cid, bool_or(mau) mau, max(preco_fecho) preco,
       coalesce(max(dias) FILTER (WHERE quando = 'antes'), 0) dias_antes,
       coalesce(max(dias) FILTER (WHERE quando = 'depois'), 0) dias_depois
  FROM claims GROUP BY 1, 2, 3, 4;

-- ════════════════════════════════════════════════════════════
-- 2. Migração 20261008160000 (mesmo texto do ficheiro)
-- ════════════════════════════════════════════════════════════
-- Um TVDE fechado ou substituído tem sempre data_fim — e não a perde.
--
-- O aluguer é calculado ao vivo a partir de data_inicio/data_fim do contrato
-- (ecrã: periodosDoContrato → buildSlotPeriodos; fecho: reivindicarDiasPorContrato).
-- Nenhum dos dois olha para o estado: data_fim NULL quer dizer "cobra até ao
-- fim da semana pedida", mesmo num contrato fechado ou numa versão substituída.
--
-- Medido a 2026-10-08, 78 contratos estavam assim e cobravam semanas inteiras
-- depois de o motorista sair (caso que o revelou: António Batista, #462):
--   * 47 versões substituídas pela renovação antiga (até 31/08), que fechava a
--     versão que saía sem lhe pôr data_fim. A renovação deixou de versionar
--     em 20260908093000; ficou o legado.
--   * 31 contratos fechados sem data_fim. Antes de 24/09 o diálogo de fecho
--     não a gravava (decf1477). Depois disso continuou a acontecer por outra
--     porta: o formulário do contrato manda data_fim = NULL em QUALQUER
--     gravação de TVDE, e esta trigger deixava passar tudo num contrato
--     fechado. Editar uma observação num contrato fechado voltava a pô-lo a
--     cobrar. O mesmo ao escolher "Fechado" no estado do formulário.
--
-- O que muda:
--   1. Num TVDE fechado a data_fim não se apaga (fica a anterior), e fechar
--      sem data grava a de agora. Escrever uma data nova continua a poder-se.
--   2. A trigger passa a correr também quando só muda o estado.
--   3. Preenche a data_fim dos 78: versão substituída → substituido_em (ou data_inicio, se foi substituída antes de começar);
--      fechado → data da recolha marcada no calendário (a mesma que o diálogo
--      de fecho grava), ou o último fecho registado se o contrato foi reaberto
--      depois dessa recolha. Sempre depois de data_inicio, que chk_contratos_periodo_valido
--      exige fim > início: um segundo depois dá zero dias cobrados.
--
-- O acerto do dinheiro já lançado (líquidos, fecho semanal) é um script à
-- parte: scripts/acerto_aluguer_apos_fecho_2026-10-08.sql.

-- ── 1. A regra ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_tvde_nasce_sem_data_fim() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  -- Segunda-feira 00:00 em Lisboa. Antes disto, as semanas já fecharam.
  v_semana timestamptz :=
    date_trunc('week', now() AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon';
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A data que vinha em data_fim era, na prática, a da próxima renovação.
    IF NEW.data_fim IS NOT NULL THEN
      IF NEW.proxima_renovacao_em IS NULL THEN
        NEW.proxima_renovacao_em := NEW.data_fim;
      END IF;
      NEW.data_fim := NULL;
    END IF;

    IF COALESCE(NEW.is_longa_duracao, false)
       AND NEW.proxima_renovacao_em IS NULL
       AND NEW.data_inicio IS NOT NULL THEN
      NEW.proxima_renovacao_em := public.proxima_data_renovacao(
        NEW.data_inicio, NEW.renovacao_opcao::text, NEW.renovacao_intervalo_dias);
    END IF;

    RETURN NEW;
  END IF;

  -- Fechado sem data_fim cobrava para sempre. Quem a apaga (o formulário, em
  -- qualquer gravação) fica com a que estava; quem fecha sem data fica com
  -- a de agora (ou o início + 1 s, se ainda não começou: a base exige fim > início).
  IF NEW.estado_operacional = 'fechado'
     AND NEW.substituido_em IS NULL
     AND NEW.deleted_at IS NULL
     AND NEW.data_fim IS NULL THEN
    NEW.data_fim := COALESCE(OLD.data_fim, greatest(now(), NEW.data_inicio + interval '1 second'));
    RETURN NEW;
  END IF;

  -- UPDATE. Só manda enquanto o contrato está vivo: quando acaba (fechado,
  -- cancelado) ou é substituído, data_fim é o fim real e é ele que pára o
  -- aluguer — a troca de viatura escreve-o na versão que sai.
  IF NEW.substituido_em IS NOT NULL
     OR NEW.deleted_at IS NOT NULL
     OR NEW.estado_operacional NOT IN ('agendado', 'em_curso') THEN
    RETURN NEW;
  END IF;

  -- Alguém escreveu uma data de fim: queria dizer a próxima renovação.
  -- A data_fim fica como estava — NULL num TVDE normal; num de legado, a data
  -- antiga, porque trocá-la por outra mudava o que já se cobrou.
  IF NEW.data_fim IS NOT NULL AND NEW.data_fim IS DISTINCT FROM OLD.data_fim THEN
    IF NEW.proxima_renovacao_em IS NOT DISTINCT FROM OLD.proxima_renovacao_em THEN
      NEW.proxima_renovacao_em := NEW.data_fim;
    END IF;
    NEW.data_fim := OLD.data_fim;
    RETURN NEW;
  END IF;

  -- Apagar uma data de fim de legado que já ficou para trás cobrava as
  -- semanas desde então. Fica como estava — o caminho é Renovar (reabre a
  -- partir de hoje) ou Fechar. Não se recusa com erro de propósito: o
  -- formulário de TVDE manda data_fim = NULL em QUALQUER gravação
  -- (SectionEntregaRecolha), e um erro impedia o gestor de corrigir uma
  -- observação nestes contratos.
  IF NEW.data_fim IS NULL AND OLD.data_fim IS NOT NULL AND OLD.data_fim < v_semana THEN
    NEW.data_fim := OLD.data_fim;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Também quando só muda o estado ─────────────────────
-- Fechar por um UPDATE que não traga data_fim passava ao lado da regra.

DROP TRIGGER IF EXISTS trg_a_tvde_nasce_sem_data_fim ON public.contratos_renting;
CREATE TRIGGER trg_a_tvde_nasce_sem_data_fim
  BEFORE INSERT OR UPDATE OF data_fim, regime, estado_operacional ON public.contratos_renting
  FOR EACH ROW
  WHEN (NEW.regime = 'tvde'::public.contrato_regime_enum)
  EXECUTE FUNCTION public.fn_tvde_nasce_sem_data_fim();

-- ── 3. Os que já estão sem data_fim ───────────────────────
-- Duas triggers ficam de fora só durante este preenchimento:
--   * versao_imutavel recusa mexer numa versão substituída — é a primeira vez
--     que esta data se escreve, não uma edição;
--   * sincroniza_atribuicao fecharia a atribuição motorista-viatura da versão
--     NOVA (partilha o código da antiga) e mexeria nas datas que atribuem
--     combustível e portagens. As atribuições já foram fechadas no fecho.

ALTER TABLE public.contratos_renting DISABLE TRIGGER trg_contratos_renting_versao_imutavel;
ALTER TABLE public.contratos_renting DISABLE TRIGGER trg_contrato_sincroniza_atribuicao;

-- Substituída antes de começar (#642: viatura sem condições para entrega) fica com
-- data_fim um segundo depois do início: zero dias, e a base exige fim > início.
UPDATE public.contratos_renting
   SET data_fim = greatest(substituido_em, data_inicio + interval '1 second')
 WHERE deleted_at IS NULL
   AND regime = 'tvde'
   AND substituido_em IS NOT NULL
   AND data_fim IS NULL;

WITH fechados AS (
  SELECT c.id, c.data_inicio, c.updated_at,
         (SELECT max(e.data_inicio) FROM public.calendario_eventos e
           WHERE e.origem_tipo = 'contrato_renting' AND e.origem_id = c.id
             AND e.tipo = 'recolha') AS recolha,
         -- Reaberto a partir de um estado fechado (não a entrega agendado → em_curso).
         (SELECT max(h.criado_em) FROM public.contrato_historico h
           WHERE h.contrato_id = c.id AND h.evento_tipo = 'contrato_aberto'
             AND h.detalhe ~ '^(fechado|cancelado|devolvido) → ') AS reaberto
    FROM public.contratos_renting c
   WHERE c.deleted_at IS NULL
     AND c.regime = 'tvde'
     AND c.substituido_em IS NULL
     AND c.estado_operacional = 'fechado'
     AND c.data_fim IS NULL
),
datas AS (
  SELECT f.id,
         greatest(f.data_inicio + interval '1 second', CASE
           -- 10 min de folga: reabrir e voltar a fechar pelo diálogo grava a
           -- recolha no mesmo minuto.
           WHEN f.recolha IS NOT NULL
                AND (f.reaberto IS NULL OR f.reaberto <= f.recolha + interval '10 minutes')
             THEN f.recolha
           ELSE coalesce(
             (SELECT max(h.criado_em) FROM public.contrato_historico h
               WHERE h.contrato_id = f.id AND h.evento_tipo = 'contrato_fechado'
                 AND h.criado_em >= coalesce(f.reaberto, '-infinity')),
             f.recolha, f.updated_at)
         END) AS data_fim
    FROM fechados f
)
UPDATE public.contratos_renting c
   SET data_fim = d.data_fim
  FROM datas d
 WHERE c.id = d.id;

ALTER TABLE public.contratos_renting ENABLE TRIGGER trg_contrato_sincroniza_atribuicao;
ALTER TABLE public.contratos_renting ENABLE TRIGGER trg_contratos_renting_versao_imutavel;

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE v_falha int;
BEGIN
  SELECT count(*) INTO v_falha
    FROM acerto_bad b JOIN contratos_renting c ON c.id = b.id
   WHERE c.data_fim IS DISTINCT FROM b.nova_fim;
  IF v_falha > 0 THEN
    RAISE EXCEPTION 'A migração gravou % data(s) diferente(s) do plano. Nada foi gravado.', v_falha;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 3. Registo para desfazer
-- ════════════════════════════════════════════════════════════

CREATE TABLE private.acerto_aluguer_2026_10_08 (
  id bigserial PRIMARY KEY,
  tabela text NOT NULL,
  linha_id uuid NOT NULL,
  campo text NOT NULL,
  antes text,
  depois text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.acerto_aluguer_2026_10_08 FROM PUBLIC, anon, authenticated;

INSERT INTO private.acerto_aluguer_2026_10_08 (tabela, linha_id, campo, antes, depois)
SELECT 'contratos_renting', b.id, 'data_fim', NULL, b.nova_fim::text FROM acerto_bad b;

-- ════════════════════════════════════════════════════════════
-- 4. Líquidos ainda pendentes: corrige-se o líquido; o gatilho
--    sincronizar_movimento_resumo actualiza o movimento.
-- ════════════════════════════════════════════════════════════

WITH alvo AS (
  SELECT l.id, l.liquido antes, round(l.liquido + (x.aluguer_antes - x.aluguer_depois), 2) depois
    FROM motorista_liquido_semanal l
    JOIN acerto_lista x ON x.motorista_id = l.motorista_id AND x.semana_inicio = l.semana_inicio
   WHERE x.aluguer_antes <> x.aluguer_depois
     AND NOT EXISTS (SELECT 1 FROM motorista_financeiro f
                      WHERE f.liquido_semanal_id = l.id AND f.status <> 'pendente')
),
upd AS (
  UPDATE motorista_liquido_semanal l SET liquido = a.depois FROM alvo a WHERE l.id = a.id RETURNING l.id
)
INSERT INTO private.acerto_aluguer_2026_10_08 (tabela, linha_id, campo, antes, depois)
SELECT 'motorista_liquido_semanal', a.id, 'liquido', a.antes::text, a.depois::text
  FROM alvo a JOIN upd USING (id);

-- ════════════════════════════════════════════════════════════
-- 5. Semanas já pagas: o pago não se reescreve. Lança-se um crédito
--    de acerto de renda, que entra no resumo da semana corrente.
-- ════════════════════════════════════════════════════════════

WITH alvo AS (
  SELECT l.motorista_id, l.org_id, l.semana_inicio, l.semana_fim,
         round(x.aluguer_antes - x.aluguer_depois, 2) valor
    FROM motorista_liquido_semanal l
    JOIN acerto_lista x ON x.motorista_id = l.motorista_id AND x.semana_inicio = l.semana_inicio
    JOIN motorista_financeiro f ON f.liquido_semanal_id = l.id AND f.status = 'pago'
   WHERE x.aluguer_antes > x.aluguer_depois
),
ins AS (
  INSERT INTO motorista_financeiro
    (motorista_id, tipo, categoria, descricao, valor, data_movimento, status, org_id, referencia)
  SELECT motorista_id, 'credito', 'renda_viatura',
         'Acerto: aluguer cobrado depois do fim do contrato, semana de '
           || to_char(semana_inicio, 'DD/MM') || ' a ' || to_char(semana_fim, 'DD/MM/YYYY'),
         valor, current_date, 'pendente', org_id, 'acerto-aluguer-2026-10-08'
    FROM alvo
  RETURNING id, valor
)
INSERT INTO private.acerto_aluguer_2026_10_08 (tabela, linha_id, campo, antes, depois)
SELECT 'motorista_financeiro', id, 'insert', NULL, valor::text FROM ins;

-- ════════════════════════════════════════════════════════════
-- 6. Fecho semanal (motorista_resumo_semanal)
-- ════════════════════════════════════════════════════════════

-- 6a. Linhas dos contratos maus: só os dias até ao fim novo. Nunca sobe;
--     receitas e despesas da linha ficam (o fecho põe-nas na 1.ª linha do
--     motorista na semana, e apagá-la perdia-as).
WITH alvo AS (
  SELECT r.id, r.custo_aluguer antes,
         least(r.custo_aluguer,
               round(b.preco_fecho / 7 * least(coalesce(f.dias_depois, m.max_dias), m.max_dias), 2)) depois
    FROM motorista_resumo_semanal r
    JOIN acerto_bad b ON b.id = r.contrato_id
    LEFT JOIN acerto_fecho f ON f.motorista_id = r.motorista_id AND f.cid = r.contrato_id
                            AND f.semana_inicio = r.semana_inicio AND f.semana_fim = r.semana_fim
    CROSS JOIN LATERAL (
      SELECT greatest(0, least(r.semana_fim, b.fim_novo) - greatest(r.semana_inicio, b.ini + 1) + 1) max_dias
    ) m
   -- Semana que acaba até ao fim novo não muda com a correcção: não se toca.
   WHERE r.semana_fim > b.fim_novo
),
upd AS (
  UPDATE motorista_resumo_semanal r SET custo_aluguer = a.depois
    FROM alvo a WHERE r.id = a.id AND a.depois < a.antes RETURNING r.id
)
INSERT INTO private.acerto_aluguer_2026_10_08 (tabela, linha_id, campo, antes, depois)
SELECT 'motorista_resumo_semanal', a.id, 'custo_aluguer', a.antes::text, a.depois::text
  FROM alvo a JOIN upd USING (id);

-- 6b. Dias que o contrato mau tirava a outro contrato do mesmo motorista
--     passam para esse, como o fecho teria feito.
WITH ganhos AS (
  SELECT f.*, c.viatura_id, c.org_id
    FROM acerto_fecho f JOIN contratos_renting c ON c.id = f.cid
   WHERE f.dias_depois > f.dias_antes AND NOT f.mau AND f.preco > 0
     AND NOT EXISTS (SELECT 1 FROM motorista_resumo_semanal r
                      WHERE r.motorista_id = f.motorista_id AND r.contrato_id = f.cid
                        AND r.semana_inicio = f.semana_inicio AND r.semana_fim = f.semana_fim)
     AND EXISTS (SELECT 1 FROM private.acerto_aluguer_2026_10_08 a
                   JOIN motorista_resumo_semanal r ON r.id = a.linha_id
                  WHERE a.tabela = 'motorista_resumo_semanal' AND r.motorista_id = f.motorista_id
                    AND r.semana_inicio = f.semana_inicio AND r.semana_fim = f.semana_fim)
),
ins AS (
  INSERT INTO motorista_resumo_semanal
    (org_id, motorista_id, contrato_id, viatura_id, semana_inicio, semana_fim, custo_aluguer, gerado_em)
  SELECT org_id, motorista_id, cid, viatura_id, semana_inicio, semana_fim,
         round(dias_depois * preco / 7, 2), now()
    FROM ganhos
  ON CONFLICT (motorista_id, contrato_id, semana_inicio, semana_fim) DO NOTHING
  RETURNING id, custo_aluguer
)
INSERT INTO private.acerto_aluguer_2026_10_08 (tabela, linha_id, campo, antes, depois)
SELECT 'motorista_resumo_semanal', id, 'custo_aluguer', NULL, custo_aluguer::text FROM ins;

-- ════════════════════════════════════════════════════════════
-- 7. Receita por viatura (viatura_resumo_semanal), pelo mesmo delta
-- ════════════════════════════════════════════════════════════

CREATE TEMP TABLE acerto_viatura ON COMMIT DROP AS
SELECT r.org_id, r.viatura_id, r.semana_inicio, r.semana_fim,
       sum(a.depois::numeric - coalesce(a.antes::numeric, 0)) delta
  FROM private.acerto_aluguer_2026_10_08 a
  JOIN motorista_resumo_semanal r ON r.id = a.linha_id
 WHERE a.tabela = 'motorista_resumo_semanal'
 GROUP BY 1, 2, 3, 4
HAVING sum(a.depois::numeric - coalesce(a.antes::numeric, 0)) <> 0;

WITH upd AS (
  UPDATE viatura_resumo_semanal v
     SET receita_aluguer = greatest(0, v.receita_aluguer + d.delta)
    FROM acerto_viatura d
   WHERE v.viatura_id = d.viatura_id AND v.semana_inicio = d.semana_inicio AND v.semana_fim = d.semana_fim
  RETURNING v.id, v.receita_aluguer depois, d.delta
)
INSERT INTO private.acerto_aluguer_2026_10_08 (tabela, linha_id, campo, antes, depois)
SELECT 'viatura_resumo_semanal', id, 'receita_aluguer', (depois - delta)::text, depois::text FROM upd;

WITH ins AS (
  INSERT INTO viatura_resumo_semanal (org_id, viatura_id, semana_inicio, semana_fim, receita_aluguer, gerado_em)
  SELECT d.org_id, d.viatura_id, d.semana_inicio, d.semana_fim, d.delta, now()
    FROM acerto_viatura d
   WHERE d.delta > 0
     AND NOT EXISTS (SELECT 1 FROM viatura_resumo_semanal v
                      WHERE v.viatura_id = d.viatura_id AND v.semana_inicio = d.semana_inicio
                        AND v.semana_fim = d.semana_fim)
  RETURNING id, receita_aluguer
)
INSERT INTO private.acerto_aluguer_2026_10_08 (tabela, linha_id, campo, antes, depois)
SELECT 'viatura_resumo_semanal', id, 'receita_aluguer', NULL, receita_aluguer::text FROM ins;

-- ════════════════════════════════════════════════════════════
-- 8. Relatório
-- ════════════════════════════════════════════════════════════

SELECT tabela, campo, count(*) linhas,
       round(sum(coalesce(antes::numeric, 0) - coalesce(depois::numeric, 0)) FILTER (WHERE campo <> 'data_fim' AND campo <> 'insert'), 2) reduzido,
       round(sum(depois::numeric) FILTER (WHERE campo = 'insert' OR (antes IS NULL AND campo <> 'data_fim')), 2) acrescentado,
       (SELECT count(*) FROM contratos_renting c
         WHERE c.deleted_at IS NULL AND c.regime = 'tvde' AND c.data_fim IS NULL
           AND (c.substituido_em IS NOT NULL OR c.estado_operacional = 'fechado')) tvde_fechados_sem_fim
  FROM private.acerto_aluguer_2026_10_08
 GROUP BY 1, 2 ORDER BY 1, 2;

-- ── ENSAIO ────────────────────────────────────────────────
-- Para ensaiar: acrescentar o bloco abaixo (sem os '-- ') no fim. Mostra o
-- relatório no erro e desfaz tudo, porque a transacção acaba em excepção.
--
-- DO $$
-- DECLARE r text; v_sem_fim int; v_antonio text; v_cred text;
-- BEGIN
--   SELECT string_agg(format('%s.%s: %s linhas, antes-depois %s, novo %s', tabela, campo, n, red, acr), ' | ' ORDER BY tabela, campo)
--     INTO r
--     FROM (SELECT tabela, campo, count(*) n,
--                  round(sum(coalesce(antes::numeric, 0) - coalesce(depois::numeric, 0)) FILTER (WHERE campo NOT IN ('data_fim', 'insert')), 2) red,
--                  round(sum(depois::numeric) FILTER (WHERE campo = 'insert' OR (antes IS NULL AND campo <> 'data_fim')), 2) acr
--             FROM private.acerto_aluguer_2026_10_08 GROUP BY 1, 2) x;
--   SELECT count(*) INTO v_sem_fim FROM contratos_renting c
--    WHERE c.deleted_at IS NULL AND c.regime = 'tvde' AND c.data_fim IS NULL
--      AND (c.substituido_em IS NOT NULL OR c.estado_operacional = 'fechado');
--   SELECT format('liquido 28/09=%s, mov=%s %s', l.liquido, f.tipo, f.valor) INTO v_antonio
--     FROM motorista_liquido_semanal l LEFT JOIN motorista_financeiro f ON f.liquido_semanal_id = l.id
--    WHERE l.motorista_id = 'b1761bad-2d51-47b9-a076-be2c9cbdd4ea' AND l.semana_inicio = '2026-09-28';
--   SELECT format('%s creditos, %s motoristas, %s EUR', count(*), count(distinct motorista_id), sum(valor)) INTO v_cred
--     FROM motorista_financeiro WHERE referencia = 'acerto-aluguer-2026-10-08';
--   RAISE EXCEPTION 'ENSAIO, nada gravado. % || TVDE fechados sem fim: % || Antonio: % || %', r, v_sem_fim, v_antonio, v_cred;
-- END $$;
