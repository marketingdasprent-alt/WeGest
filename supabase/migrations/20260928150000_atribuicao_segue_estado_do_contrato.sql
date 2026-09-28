-- A atribuição motorista↔viatura segue o estado do contrato.
--
-- Ticket: o histórico da viatura BI-26-CR mostrava "Encerrado" numa atribuição
-- cujo contrato (#864, TVDE) está em curso. Em motorista_viaturas a linha tinha
-- status='encerrado' e data_fim=NULL — um estado que nenhum ecrã sabe ler.
--
-- Causa: status e data_fim tinham escritores diferentes.
--   · fn_contrato_sincroniza_atribuicao (AFTER UPDATE OF data_fim em
--     contratos_renting) copiava a data_fim do contrato para a atribuição e
--     nunca mexia no status.
--   · 20260922110000 pôs status='encerrado' em quem tinha data_fim passada.
--   · 20260924100000 (TVDE sem data_fim) limpou a data_fim de 22 contratos a
--     24-09 15:51; a trigger copiou o NULL e ficou encerrado + NULL.
--   · Reverter um fecho (fechado/cancelado → em_curso, UPDATE directo em
--     useContratosRenting.ts) não reactivava a atribuição: a trigger só ouvia
--     data_fim.
-- Em produção a 28-09: 27 linhas encerrado+NULL, 24 com contrato TVDE em curso
-- na mesma viatura (8 sem outra linha activa do motorista, 16 duplicados de
-- renovação com outra linha activa na mesma viatura), 0 conflitos com outros
-- motoristas; 16 viaturas 'disponivel' com contrato em curso.
--
-- O que muda:
--   1. fn_contrato_sincroniza_atribuicao passa a escrever status E data_fim,
--      e a trigger passa a ouvir também estado_operacional (reabertura):
--        · data_fim NULL e contrato vivo (não apagado, não substituído,
--          em_curso/agendado)           → 'ativo', data_fim NULL
--        · data_fim (Lisboa) < hoje     → 'encerrado', data_fim = essa data
--        · data_fim hoje/futura         → só a data; o status fica, excepto
--          numa reabertura (fechado/cancelado/devolvido → em_curso), que o
--          põe 'ativo'
--      Casa as DUAS observações que os automatismos escrevem: 'Gerado ao
--      associar condutor ao contrato #N' (fn_contrato_condutor_liga_motorista)
--      e 'Gerado automaticamente pelo contrato de aluguer #N'
--      (contrato_renting_liga_motorista_open). Antes só a primeira, e o #892
--      ficava de fora com o mesmo bug.
--      Segue só a linha MAIS RECENTE de cada motorista nessa viatura: os
--      duplicados de renovação partilham a observação da linha viva, e sem
--      isto a próxima limpeza da data_fim do contrato punha as duas a
--      ativo + NULL — voltava o duplicado "Presente" que a reparação limpa.
--      A data escrita nunca fica antes de mv.data_inicio (greatest): a trigger
--      motorista_viaturas_normaliza anula data_fim < data_inicio, e era assim
--      que se voltava a encerrado + NULL.
--      Decisão: numa reabertura com data_fim já passada a atribuição fica
--      'encerrado' com essa data. Reverter o fecho não limpa data_fim (ver
--      patchContratoAoReverterFecho); num TVDE uma data_fim passada é o fim
--      real do aluguer (20260924100000), e 'ativo' com data passada é o
--      meio-estado que 20260922110000 eliminou. A gravação seguinte do
--      formulário TVDE limpa a data e esta trigger reactiva.
--   2. Reabertura da VIATURA: já é tratada por trg_contratos_disponibilidade
--      (AFTER UPDATE OF estado_operacional → recalcular_disponibilidade_viatura
--      → 'em_uso'). Não se duplica. contrato_renting_liga_motorista_close só
--      fecha; contrato_renting_liga_motorista_open só ouve viatura_id e
--      cliente_id — nenhuma trata a atribuição na reabertura, por isso ela
--      vive na função do ponto 1.
--   3. Reparação, idempotente (ver 20260922110000, passo 2):
--        A) encerrado+NULL, contrato TVDE em curso na mesma viatura, motorista
--           sem outra linha activa → 'ativo' (8);
--        B) igual mas com outra linha activa do mesmo motorista na mesma
--           viatura (duplicado de renovação) → data_fim = véspera da linha
--           activa seguinte, nunca antes do próprio início; status fica
--           'encerrado' (16);
--        C) viaturas 'disponivel' com contrato em curso vivo DA MESMA ORG →
--           'em_uso' (16). A igualdade de org é do Vigia: hoje não muda nada,
--           mas fecha o padrão cross-org.
--      Ficam de fora 3 linhas sem contrato em curso a casar: #33 (a versão viva
--      está 'agendado' e o motorista já tem linha activa na viatura) e #29 ×2
--      (as versões da BJ-34-GJ estão substituída/apagada; a viva é noutra
--      viatura).
--
-- Não há função nova: CREATE OR REPLACE mantém a ACL da existente
-- (postgres, authenticated, service_role; anon nunca teve EXECUTE).

CREATE OR REPLACE FUNCTION public.fn_contrato_sincroniza_atribuicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data    date;
  v_vivo    boolean;
  v_reabriu boolean;
  v_status  text;  -- NULL = não mexe no status
BEGIN
  IF NEW.viatura_id IS NULL THEN RETURN NEW; END IF;

  v_vivo := NEW.deleted_at IS NULL
        AND NEW.substituido_em IS NULL
        AND NEW.estado_operacional IN ('em_curso', 'agendado');

  -- Reabertura: o simétrico de trg_contrato_renting_liga_motorista_close,
  -- que fecha quando o contrato sai de agendado/em_curso.
  v_reabriu := v_vivo
           AND NEW.estado_operacional = 'em_curso'
           AND OLD.estado_operacional NOT IN ('agendado', 'em_curso');

  IF NEW.data_fim IS NOT DISTINCT FROM OLD.data_fim AND NOT v_reabriu THEN
    RETURN NEW;
  END IF;

  v_data := (NEW.data_fim AT TIME ZONE 'Europe/Lisbon')::date;

  IF v_data IS NULL THEN
    v_status := CASE WHEN v_vivo THEN 'ativo' END;
  ELSIF v_data < CURRENT_DATE THEN
    v_status := 'encerrado';
  ELSE
    v_status := CASE WHEN v_reabriu THEN 'ativo' END;
  END IF;

  UPDATE public.motorista_viaturas mv
     SET data_fim = CASE WHEN v_data IS NULL THEN NULL
                         ELSE greatest(v_data, mv.data_inicio) END,
         status   = COALESCE(v_status, mv.status)
   WHERE mv.viatura_id = NEW.viatura_id
     AND mv.org_id = NEW.org_id
     AND mv.observacoes IN (
       'Gerado ao associar condutor ao contrato #' || NEW.codigo,
       'Gerado automaticamente pelo contrato de aluguer #' || NEW.codigo
     )
     -- Só a linha mais recente do motorista nesta viatura: os duplicados de
     -- renovação partilham a observação, e reactivá-los todos voltava a pôr
     -- dois "Presente" no histórico.
     AND NOT EXISTS (
       SELECT 1 FROM public.motorista_viaturas n
        WHERE n.viatura_id = mv.viatura_id
          AND n.motorista_id = mv.motorista_id
          AND n.id <> mv.id
          AND (n.data_inicio > mv.data_inicio
               OR (n.data_inicio = mv.data_inicio AND n.created_at > mv.created_at))
     )
     AND (
       mv.data_fim IS DISTINCT FROM (CASE WHEN v_data IS NULL THEN NULL
                                          ELSE greatest(v_data, mv.data_inicio) END)
       OR mv.status IS DISTINCT FROM COALESCE(v_status, mv.status)
     );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_contrato_sincroniza_atribuicao() IS
  'Mantém a atribuição gerada pelo contrato (motorista_viaturas com observação "Gerado ao associar condutor ao contrato #N" ou "Gerado automaticamente pelo contrato de aluguer #N") a seguir o contrato, em data_fim E status: contrato vivo sem data_fim → ativo; data_fim passada → encerrado; data_fim futura → só a data; reabertura (→ em_curso) → ativo. Só toca na linha mais recente de cada motorista na viatura — os duplicados de renovação partilham a observação e não podem voltar a ativo. Ver 20260928150000.';

-- A trigger passa a ouvir também estado_operacional (reabertura).
DROP TRIGGER IF EXISTS trg_contrato_sincroniza_atribuicao ON public.contratos_renting;
CREATE TRIGGER trg_contrato_sincroniza_atribuicao
  AFTER UPDATE OF data_fim, estado_operacional ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrato_sincroniza_atribuicao();

COMMENT ON TRIGGER trg_contrato_sincroniza_atribuicao ON public.contratos_renting IS
  'Dispara em data_fim e em estado_operacional (reabertura). Corre depois de trg_contrato_renting_liga_motorista_close (ordem alfabética). Ver 20260928150000.';

-- ── Reparação do passivo (idempotente) ──────────────────────────────────
DO $$
DECLARE
  v_a integer;
  v_b integer;
  v_c integer;
BEGIN
  -- A) Encerrado sem fim, contrato TVDE em curso na mesma viatura e o
  --    motorista sem outra linha activa: a atribuição é a real → 'ativo'.
  UPDATE public.motorista_viaturas mv
     SET status = 'ativo'
    FROM public.contratos_renting c
   WHERE mv.status = 'encerrado'
     AND mv.data_fim IS NULL
     AND c.viatura_id = mv.viatura_id
     AND c.org_id = mv.org_id
     AND c.regime = 'tvde'
     AND c.estado_operacional = 'em_curso'
     AND c.deleted_at IS NULL
     AND c.substituido_em IS NULL
     AND mv.observacoes IN (
       'Gerado ao associar condutor ao contrato #' || c.codigo,
       'Gerado automaticamente pelo contrato de aluguer #' || c.codigo
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.motorista_viaturas o
        WHERE o.motorista_id = mv.motorista_id
          AND o.id <> mv.id
          AND o.status = 'ativo'
          AND (o.data_fim IS NULL OR o.data_fim >= CURRENT_DATE)
     );
  GET DIAGNOSTICS v_a = ROW_COUNT;

  -- B) Igual, mas o motorista já tem outra linha activa na MESMA viatura
  --    (duplicado deixado por uma renovação): fecha na véspera da linha activa
  --    seguinte — nunca antes do próprio início, porque
  --    motorista_viaturas_normaliza anula data_fim < data_inicio e voltava tudo
  --    a encerrado + NULL. Sem linha posterior, fecha no próprio dia de início.
  UPDATE public.motorista_viaturas mv
     SET data_fim = greatest(
           COALESCE((
             SELECT min(o.data_inicio) - 1
               FROM public.motorista_viaturas o
              WHERE o.motorista_id = mv.motorista_id
                AND o.viatura_id = mv.viatura_id
                AND o.id <> mv.id
                AND o.status = 'ativo'
                AND (o.data_fim IS NULL OR o.data_fim >= CURRENT_DATE)
                AND o.data_inicio > mv.data_inicio
           ), mv.data_inicio),
           mv.data_inicio)
    FROM public.contratos_renting c
   WHERE mv.status = 'encerrado'
     AND mv.data_fim IS NULL
     AND c.viatura_id = mv.viatura_id
     AND c.org_id = mv.org_id
     AND c.regime = 'tvde'
     AND c.estado_operacional = 'em_curso'
     AND c.deleted_at IS NULL
     AND c.substituido_em IS NULL
     AND mv.observacoes IN (
       'Gerado ao associar condutor ao contrato #' || c.codigo,
       'Gerado automaticamente pelo contrato de aluguer #' || c.codigo
     )
     AND EXISTS (
       SELECT 1 FROM public.motorista_viaturas o
        WHERE o.motorista_id = mv.motorista_id
          AND o.viatura_id = mv.viatura_id
          AND o.id <> mv.id
          AND o.status = 'ativo'
          AND (o.data_fim IS NULL OR o.data_fim >= CURRENT_DATE)
     );
  GET DIAGNOSTICS v_b = ROW_COUNT;

  -- C) Viaturas dadas como disponíveis com um contrato em curso vivo da mesma
  --    org: o mesmo valor que recalcular_disponibilidade_viatura escreve para
  --    "ocupada".
  UPDATE public.viaturas v
     SET status = 'em_uso'
   WHERE v.status = 'disponivel'
     AND EXISTS (
       SELECT 1 FROM public.contratos_renting c
        WHERE c.viatura_id = v.id
          AND c.org_id = v.org_id
          AND c.deleted_at IS NULL
          AND c.substituido_em IS NULL
          AND c.estado_operacional = 'em_curso'
     );
  GET DIAGNOSTICS v_c = ROW_COUNT;

  RAISE NOTICE 'atribuicao_segue_estado_do_contrato: A) % atribuições reactivadas, B) % duplicados fechados na véspera, C) % viaturas passaram a em_uso',
    v_a, v_b, v_c;
END $$;

-- O Supabase serve a API a partir de um cache do desenho da base: sem isto,
-- a função e a trigger novas só são reconhecidas na próxima vez que ele recarregar.
NOTIFY pgrst, 'reload schema';
