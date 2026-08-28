-- ============================================================
-- Fix sistémico: reservas.viatura_id não seguia a troca de viatura
-- ============================================================
-- Bug reportado: ao trocar a viatura de um contrato de renting activo
-- (troca/upgrade/downgrade via ContratoForm → criar_versao_contrato_renting),
-- contratos_renting.viatura_id passa para a viatura nova mas reserva_id
-- mantém-se e reservas.viatura_id NUNCA é actualizado. A reserva de origem
-- fica presa para sempre à viatura antiga:
--   • a viatura antiga continua a aparecer ocupada/"em reserva" (ghost
--     occupation) mesmo depois de devolvida — useViaturasOcupadasPeriodo/
--     useViaturasOcupacao e recalcular_disponibilidade_viatura leem
--     reservas.viatura_id de forma independente do contrato ligado;
--   • a viatura nova só fica ocupada pela via do contrato, nunca pela
--     via da reserva;
--   • quem abre a reserva directamente continua a ver a matrícula/viatura
--     antiga, apesar do contrato gerado a partir dela já estar noutra.
--
-- Mesmo padrão já resolvido para `grupo` em
-- 20260714140000_sync_grupo_reserva_contrato_viatura.sql (149 reservas +
-- 147 contratos dessincronizados), nunca replicado para `viatura_id`.
-- Diferença de forma: `grupo` deriva-se de viaturas.grupo_id de forma
-- independente em cada tabela (BEFORE INSERT/UPDATE, muta a própria NEW);
-- aqui o valor certo vive no CONTRATO (a reserva segue-o) e o alvo é
-- outra tabela — por isso o mecanismo tem de ser um trigger AFTER que
-- escreve em public.reservas via reserva_id, não um BEFORE que muta NEW.
--
-- Nota deliberada: `matricula` (reservas/contratos_renting) NÃO é
-- sincronizada aqui. Ao contrário de `grupo`, é um snapshot que pode
-- divergir de propósito da viatura actual (ver comentário na coluna
-- contratos_renting.matricula — "viatura pode mudar matrícula, legalmente
-- raro mas possível") — nunca foi tratada como campo derivado em nenhum
-- trigger existente, por isso não introduzimos esse comportamento agora.
--
-- Robustez: cobre QUALQUER INSERT/UPDATE de viatura_id/reserva_id em
-- contratos_renting, independentemente da origem — troca manual no
-- formulário, criar_versao_contrato_renting (evento_troca), renovar_
-- contrato_renting (renovação, mesma viatura, no-op), ou uma futura RPC/
-- fix administrativo. Não depende do formulário nem de nenhum caminho
-- específico — único mecanismo, ao nível da BD.
--
-- Segurança contra overbooking: não há EXCLUDE em `reservas` (só em
-- contratos_renting) — o `viaturaLocked` do formulário protege o EXCLUDE
-- do CONTRATO, não da reserva. Além disso, `trg_contratos_renting_
-- validar_reserva` (BEFORE INSERT OR UPDATE OF viatura_id, ...) já rejeita
-- a troca se a viatura nova tiver outra reserva activa sobreposta — este
-- trigger AFTER só corre depois dessa validação já ter passado.
--
-- Ordem entre triggers AFTER (ver 20260703000006_documentar_ordem_
-- triggers_contratos_renting.sql — Postgres ordena por nome, alfabético):
--   trg_contrato_renting_cascata_versao
--   trg_contrato_renting_liga_motorista_close
--   trg_contrato_renting_liga_motorista_open
--   trg_contrato_renting_sync_reserva_viatura   ← este, tem de correr
--     ANTES de trg_contratos_disponibilidade: essa trigger chama
--     recalcular_disponibilidade_viatura(), que lê reservas.viatura_id/
--     estado para decidir o status da viatura — só fica correcta na
--     primeira passagem se a reserva já estiver sincronizada. O nome
--     ("trg_contrato_..." antes de "trg_contratoS_...") garante isso.
--   trg_contratos_disponibilidade
--
-- Efeito lateral desejado: ao corrigir reservas.viatura_id (aqui e no
-- backfill), dispara-se trg_reservas_disponibilidade (já existente),
-- que chama recalcular_disponibilidade_viatura tanto para a viatura
-- antiga como para a nova — a "ghost occupation" resolve-se sozinha,
-- sem precisar de lógica extra aqui.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_reserva_viatura_from_contrato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Versão substituída (histórico imutável, ver fn_contratos_renting_versao_imutavel):
  -- quem manda na reserva é sempre a versão ACTIVA do contrato, nunca uma versão velha.
  IF NEW.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reserva_id IS NULL OR NEW.viatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.reservas
     SET viatura_id = NEW.viatura_id
   WHERE id = NEW.reserva_id
     AND deleted_at IS NULL
     AND viatura_id IS DISTINCT FROM NEW.viatura_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_reserva_viatura_from_contrato() IS
  'Mantém reservas.viatura_id sempre igual ao viatura_id da versão activa do '
  'contrato ligado (via reserva_id) — corre em qualquer INSERT/UPDATE de '
  'viatura_id/reserva_id, não só na troca activa no formulário. Fix 2026-07-22 '
  '(reserva ficava presa à viatura antiga após troca/upgrade/downgrade).';

DROP TRIGGER IF EXISTS trg_contrato_renting_sync_reserva_viatura ON public.contratos_renting;
CREATE TRIGGER trg_contrato_renting_sync_reserva_viatura
  AFTER INSERT OR UPDATE OF viatura_id, reserva_id ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.sync_reserva_viatura_from_contrato();

COMMENT ON TRIGGER trg_contrato_renting_sync_reserva_viatura ON public.contratos_renting IS
  'Ordem alfabética importa (ver 20260703000006): tem de correr ANTES de '
  'trg_contratos_disponibilidade no mesmo UPDATE OF viatura_id, para que '
  'recalcular_disponibilidade_viatura já leia reservas.viatura_id corrigido.';

-- ────────────────────────────────────────────────────────────
-- Backfill: repara já todas as reservas presas a uma viatura antiga por
-- causa de trocas passadas, sem esperar que cada contrato seja reaberto.
-- ────────────────────────────────────────────────────────────
UPDATE public.reservas r
   SET viatura_id = c.viatura_id
  FROM public.contratos_renting c
 WHERE c.reserva_id = r.id
   AND c.org_id = r.org_id
   AND c.deleted_at IS NULL
   AND c.substituido_em IS NULL
   AND r.deleted_at IS NULL
   AND r.viatura_id IS DISTINCT FROM c.viatura_id;
