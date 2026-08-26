-- ============================================================
-- Fix: contrato_renting_liga_motorista_close ficava preso quando o
-- contrato tem vários condutores (BN-36-MG / Premium Ride)
-- ============================================================
-- Bug reportado: "motorista fica inativo mas não pode sair do contrato,
-- aparece mesmo como removido".
--
-- Causa raiz: a versão anterior desta função resolvia "o" motorista do
-- contrato com `LIMIT 1` (sem ORDER BY, sem preferir is_principal) a partir
-- de contrato_condutores, e só fechava a linha motorista_viaturas DESSE
-- motorista. Mas a ligação real em motorista_viaturas é criada, um de cada
-- vez, por fn_contrato_condutor_liga_motorista (só liga um motorista por
-- viatura de cada vez — "não forçamos 1:1 aqui"). Em contratos com mais do
-- que um condutor (típico de cliente-frota, e agravado porque
-- criar_versao_contrato_renting/renovar_contrato_renting copiam
-- contrato_condutores de versão em versão), o motorista escolhido pelo
-- LIMIT 1 podia ser diferente do que realmente tinha a linha
-- motorista_viaturas aberta — essa linha nunca fechava.
--
-- Em paralelo, contrato_renting_inativar_motorista_na_devolucao() já marca
-- TODOS os condutores do contrato como inativos (sem esta ambiguidade) — daí
-- o motorista ficar "inativo" e, ao mesmo tempo, continuar preso à viatura.
--
-- Fix: em vez de adivinhar "qual" motorista fechar, fecha directamente
-- TODAS as linhas motorista_viaturas activas desta viatura (só pode haver
-- uma, por desenho de fn_contrato_condutor_liga_motorista), e só depois
-- decide se cada motorista efectivamente fechado deve ficar inactivo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_liga_motorista_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed_motorista_id uuid;
  v_tem_outro_contrato boolean;
BEGIN
  -- Linha já era história antes desta alteração: o vínculo motorista-viatura
  -- pertence agora ao contrato sucessor — não tocar. (No momento da
  -- substituição OLD.substituido_em ainda é NULL → fecho normal mantém-se.)
  IF OLD.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.viatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_closed_motorista_id IN
    UPDATE public.motorista_viaturas
       SET status = 'encerrado', data_fim = COALESCE(data_fim, CURRENT_DATE)
     WHERE viatura_id = NEW.viatura_id
       AND status = 'ativo'
    RETURNING motorista_id
  LOOP
    -- Só inactiva se não houver outro contrato_renting activo (e não
    -- substituído) para este motorista, considerando os dois caminhos
    -- (cliente_id directo OU contrato_condutores.motorista_id).
    SELECT EXISTS (
      SELECT 1
      FROM public.contratos_renting cr
      WHERE cr.id <> NEW.id
        AND cr.deleted_at IS NULL
        AND cr.substituido_em IS NULL
        AND cr.estado_operacional IN ('agendado', 'em_curso')
        AND (
          EXISTS (
            SELECT 1 FROM public.motoristas_ativos ma
            WHERE ma.id = v_closed_motorista_id AND ma.cliente_id = cr.cliente_id
          )
          OR EXISTS (
            SELECT 1 FROM public.contrato_condutores cc
            WHERE cc.contrato_id = cr.id AND cc.motorista_id = v_closed_motorista_id
          )
        )
    ) INTO v_tem_outro_contrato;

    IF NOT v_tem_outro_contrato THEN
      UPDATE public.motoristas_ativos
         SET status_ativo = false
       WHERE id = v_closed_motorista_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contrato_renting_liga_motorista_close() IS
  'Ao fechar/cancelar um contrato, fecha TODAS as linhas motorista_viaturas '
  'activas da sua viatura (não só a de "um" motorista resolvido por LIMIT 1 '
  '— esse caminho deixava o condutor real preso à viatura quando o contrato '
  'tinha vários condutores). Para cada motorista efectivamente fechado, '
  'inactiva-o só se não tiver outro contrato_renting activo.';
