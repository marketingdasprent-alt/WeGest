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
