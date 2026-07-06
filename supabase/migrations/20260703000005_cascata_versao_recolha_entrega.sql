-- ============================================================
-- Cascata versionamento → calendário: troca vira Recolha+Entrega reais
-- ============================================================
-- Bug reportado: ao trocar/upgrade/downgrade a viatura dum contrato, a
-- cascata (20260521000004) criava um evento 'troca' decorativo (sem
-- botão de acção no EventoCard — podeRealizarRenting só aceita
-- entrega/recolha — e sem suporte na RPC de token, que só aceita
-- 'entrega'/'recolha') mais uma 'recolha' da viatura NOVA agendada
-- para data_fim. Resultado visível: "o veículo novo foi para a aba
-- de recolha" e a troca em si nunca podia ser confirmada fisicamente.
--
-- Fix: a troca passa a gerar dois eventos reais e accionáveis, ambos
-- já suportados pelo fluxo existente (EventoCard → token → Realizar-
-- EntregaPage):
--   • 'recolha' AGORA (viatura ANTIGA) — devolver o carro que sai
--   • 'entrega' AGORA (viatura NOVA)   — entregar o carro que entra
-- Deixa de se criar o evento 'troca'. A recolha final da viatura nova
-- na data_fim do contrato mantém-se como antes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_versao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula_nova    text;
  v_matricula_antiga  text;
  v_cidade_entrega    text;
  v_cidade_recolha    text;
BEGIN
  -- ──────────────────────────────────────────────────────────
  -- Caso 1: contrato substituído → apagar eventos pendentes
  -- ──────────────────────────────────────────────────────────
  IF OLD.substituido_em IS NULL AND NEW.substituido_em IS NOT NULL THEN
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id   = NEW.id
       AND tipo IN ('entrega', 'recolha');
    RETURN NEW;
  END IF;

  -- ──────────────────────────────────────────────────────────
  -- Caso 2: viatura mudou numa versão > 1 → troca/upgrade/downgrade
  -- ──────────────────────────────────────────────────────────
  IF NEW.contrato_anterior_id IS NOT NULL
     AND NEW.substituido_em IS NULL
     AND OLD.viatura_id IS DISTINCT FROM NEW.viatura_id
  THEN
    SELECT matricula INTO v_matricula_nova
      FROM public.viaturas WHERE id = NEW.viatura_id;
    v_matricula_antiga := OLD.matricula;

    IF NEW.estacao_entrega_id IS NOT NULL THEN
      SELECT COALESCE(NULLIF(trim(cidade), ''), nome)
        INTO v_cidade_entrega
        FROM public.estacoes WHERE id = NEW.estacao_entrega_id;
    END IF;
    IF NEW.estacao_recolha_id IS NOT NULL THEN
      SELECT COALESCE(NULLIF(trim(cidade), ''), nome)
        INTO v_cidade_recolha
        FROM public.estacoes WHERE id = NEW.estacao_recolha_id;
    END IF;

    -- 1) Apagar eventos entrega/recolha desta versão (criados pelo
    --    cascata_open com a viatura antiga ao clonar)
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id   = NEW.id
       AND tipo IN ('entrega', 'recolha');

    -- 2) Recolha imediata da viatura ANTIGA (a devolver)
    INSERT INTO public.calendario_eventos (
      tipo, titulo, descricao, cidade,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, criado_por,
      origem_tipo, origem_id
    )
    VALUES (
      'recolha',
      COALESCE(v_matricula_antiga, '?'),
      'Troca de viatura no contrato #' || NEW.codigo || ' — devolução da viatura anterior',
      v_cidade_recolha,
      now(), now(), false,
      v_matricula_antiga, COALESCE(NEW.updated_by, auth.uid()),
      'contrato_renting', NEW.id
    );

    -- 3) Entrega imediata da viatura NOVA
    INSERT INTO public.calendario_eventos (
      tipo, titulo, descricao, cidade,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, criado_por,
      origem_tipo, origem_id
    )
    VALUES (
      'entrega',
      COALESCE(v_matricula_nova, '?'),
      'Troca de viatura no contrato #' || NEW.codigo || ' — entrega da nova viatura',
      v_cidade_entrega,
      now(), now(), false,
      v_matricula_nova, COALESCE(NEW.updated_by, auth.uid()),
      'contrato_renting', NEW.id
    );

    -- 4) Recolha final da viatura nova na data_fim do contrato (se definida)
    IF NEW.data_fim IS NOT NULL THEN
      INSERT INTO public.calendario_eventos (
        tipo, titulo, descricao, cidade,
        data_inicio, data_fim, dia_todo,
        matricula_devolver, criado_por,
        origem_tipo, origem_id
      )
      VALUES (
        'recolha',
        v_matricula_nova,
        'Gerado automaticamente pelo contrato #' || NEW.codigo,
        v_cidade_recolha,
        NEW.data_fim, NEW.data_fim, false,
        v_matricula_nova, COALESCE(NEW.updated_by, auth.uid()),
        'contrato_renting', NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_cascata_versao() IS
  'Cascateia o versionamento de contratos para o calendário: apaga eventos da '
  'versão substituída e cria recolha (viatura antiga) + entrega (viatura nova), '
  'ambos accionáveis via check-in normal, quando a viatura muda numa troca/upgrade/downgrade. '
  'Mantém a recolha final da viatura nova na data_fim do contrato.';
