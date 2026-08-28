-- ============================================================
-- NOTA DE PROVENIÊNCIA
-- ============================================================
-- Esta migração foi aplicada directamente a produção em 2026-08-20 17:01
-- (registo 20260820170108) sem ficheiro correspondente no repositório. Um
-- clone novo nunca a reproduziria — exactamente a deriva silenciosa que o
-- scripts/verificar-migracoes.mjs existe para apanhar, e que já custou 15
-- casos antes deste.
--
-- O conteúdo abaixo foi recuperado de supabase_migrations.schema_migrations
-- e é idêntico ao que correu. Produção já a tem registada, por isso não
-- volta a correr lá; serve para que a base possa ser recriada de raiz.
-- ============================================================

-- Repara os contratos nascidos de uma troca ANTES de 20260820120000, que
-- herdaram estado_operacional='em_curso' do antecessor. Como
-- tipoRealizacaoPendenteEsperada() lê 'em_curso' como "já entregue, falta
-- recolher", a entrega da viatura nova nunca era oferecida e o contrato ficava
-- em deadlock: a página só oferece a recolha, e a recolha é recusada porque a
-- entrega está por confirmar.
--
-- Passam a 'agendado' — o estado em que a RPC corrigida os teria criado. A
-- confirmação da entrega volta a pô-los em 'em_curso' pelo fluxo normal.
--
-- Triggers desligados: liga_motorista_open dispara com estado IN
-- ('agendado','em_curso'), pelo que voltaria a correr e a mexer em
-- motorista_viaturas — é o gatilho por trás do caso de sobreposição de
-- 10-16/08/2026. Aqui só queremos corrigir uma coluna, sem efeitos laterais.
-- (liga_motorista_close NÃO dispararia: a sua condição exige que o estado novo
-- saia de ('agendado','em_curso'), e 'agendado' continua lá dentro.)
--
-- Âmbito estreito de propósito: só o elo activo de uma cadeia, com evento de
-- entrega por realizar e sem km de saída registado.

ALTER TABLE public.contratos_renting DISABLE TRIGGER USER;

UPDATE public.contratos_renting c
   SET estado_operacional = 'agendado'::contrato_estado_operacional_enum
 WHERE c.deleted_at IS NULL
   AND c.substituido_em IS NULL
   AND c.estado_operacional = 'em_curso'
   AND c.km_saida IS NULL
   AND c.contrato_anterior_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.calendario_eventos e
      WHERE e.origem_tipo = 'contrato_renting'
        AND e.origem_id   = c.id
        AND e.tipo        = 'entrega'
        AND e.realizado_em IS NULL
   );

ALTER TABLE public.contratos_renting ENABLE TRIGGER USER;

-- Deixa rasto: os triggers estavam desligados, o histórico não se grava sozinho.
INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
SELECT c.id, c.org_id, 'alteracao', NULL,
       'Correcção de dados: estado passou de "em_curso" para "agendado". O contrato '
       || 'nasceu de uma troca de viatura e herdou o estado do antecessor, pelo que a '
       || 'folha de danos de entrega da viatura ' || COALESCE(c.matricula, '?')
       || ' nunca chegou a ser pedida.'
  FROM public.contratos_renting c
 WHERE c.deleted_at IS NULL
   AND c.substituido_em IS NULL
   AND c.estado_operacional = 'agendado'
   AND c.km_saida IS NULL
   AND c.contrato_anterior_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.calendario_eventos e
      WHERE e.origem_tipo = 'contrato_renting'
        AND e.origem_id   = c.id
        AND e.tipo        = 'entrega'
        AND e.realizado_em IS NULL
   );
