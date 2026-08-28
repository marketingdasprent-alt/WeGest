-- ============================================================
-- Troca/upgrade/downgrade passa a fechar formalmente o contrato antigo
-- ============================================================
-- Pedido do dono do produto (2026-07-10): ao trocar a viatura dum contrato
-- (upgrade/downgrade/troca directa), o contrato antigo deixa de ficar
-- apenas "substituído" em silêncio — passa a ser fechado a sério pelo
-- mesmo popup usado para fechar um contrato normal (FecharContratoDialog:
-- recolhido/devolvido, estação, DUA, km/combustível/fotos/assinaturas,
-- podendo também agendar a recolha para mais tarde). Só depois disso é
-- que o novo contrato é criado com a viatura nova.
--
-- Consequência directa no trigger de cascata do versionamento
-- (contrato_renting_cascata_versao, última definição em
-- 20260706150000_evento_troca_real.sql): a devolução da viatura antiga
-- já fica registada pelo fecho formal (useFecharContrato insere o próprio
-- evento 'recolha', com fotos/km/DUA quando aplicável) — por isso a
-- cascata deixa de gerar um evento 'troca' (mesmo grupo) ou 'recolha' da
-- viatura antiga (upgrade/downgrade): passaria a ficar duplicado. A
-- cascata continua a gerar a 'entrega' da viatura nova (pendente de
-- check-in, como qualquer entrega) e a recolha final na data_fim.
--
-- Efeito lateral a corrigir: "Caso 1" do mesmo trigger (contrato marcado
-- substituído) apagava incondicionalmente qualquer entrega/recolha/troca
-- ligada ao contrato antigo — isso apagaria o evento de recolha que o
-- fecho formal acabou de criar, momentos antes de criar_versao_contrato_renting
-- marcar substituido_em. Passa a apagar só os eventos "base" (criados por
-- contrato_renting_cascata_open/cascata_data_fim quando o contrato nasceu):
-- entrega exactamente em data_inicio, recolha exactamente em data_fim e
-- ainda não realizada. Isto preserva a recolha real do fecho formal
-- (data escolhida pelo gestor no popup, tipicamente distinta de data_fim).
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_versao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matricula_nova    text;
  v_cidade_entrega    text;
  v_cidade_recolha    text;
BEGIN
  -- ──────────────────────────────────────────────────────────
  -- Caso 1: contrato substituído → apagar só os eventos "base" (nascidos
  -- com o próprio contrato), nunca um evento de recolha já realizado ou
  -- criado deliberadamente pelo fecho formal desta troca.
  -- ──────────────────────────────────────────────────────────
  IF OLD.substituido_em IS NULL AND NEW.substituido_em IS NOT NULL THEN
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id   = NEW.id
       AND (
         (tipo = 'entrega' AND data_inicio = OLD.data_inicio)
         OR (
           tipo = 'recolha'
           AND OLD.data_fim IS NOT NULL
           AND data_fim = OLD.data_fim
           AND realizado_em IS NULL
         )
         OR (tipo = 'troca' AND realizado_em IS NULL)
       );
    RETURN NEW;
  END IF;

  -- ──────────────────────────────────────────────────────────
  -- Caso 2: viatura mudou numa versão > 1 → troca/upgrade/downgrade.
  -- A recolha da viatura antiga já foi tratada pelo fecho formal do
  -- contrato anterior — só falta a entrega (pendente) da viatura nova.
  -- ──────────────────────────────────────────────────────────
  IF NEW.contrato_anterior_id IS NOT NULL
     AND NEW.substituido_em IS NULL
     AND OLD.viatura_id IS DISTINCT FROM NEW.viatura_id
  THEN
    SELECT matricula INTO v_matricula_nova
      FROM public.viaturas WHERE id = NEW.viatura_id;

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

    -- Apagar eventos entrega/recolha/troca desta versão nova (criados pelo
    -- cascata_open com a viatura antiga, ao clonar).
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id   = NEW.id
       AND tipo IN ('entrega', 'recolha', 'troca');

    -- Entrega imediata da viatura NOVA — pendente de check-in, como
    -- qualquer entrega normal (fotos/km/assinaturas via QR/Calendário).
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

    -- Recolha final da viatura nova na data_fim do contrato (se definida).
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
  'Cascateia o versionamento de contratos para o calendário. Ao substituir uma versão, '
  'remove só os eventos "base" (entrega em data_inicio, recolha não-realizada em data_fim) — '
  'preserva qualquer recolha real já registada pelo fecho formal da troca. Ao mudar de '
  'viatura numa versão nova, gera a entrega (pendente) da viatura nova e a recolha final em '
  'data_fim; a recolha da viatura antiga já não é gerada aqui — é responsabilidade do fecho '
  'formal do contrato anterior (FecharContratoDialog), evitando duplicar o registo da devolução.';
