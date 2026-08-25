-- ============================================================
-- Separar o ciclo do CONTRATO do da VIATURA (parte 3/3: dados)
-- ============================================================
-- Reclassifica o passivo. Contagens à data de 2026-08-20:
--
--   18  'devolvido'                          → fechado (tipo_fecho devolvido)
--   134 'cancelado' COM substituido_em       → fechado
--       (renovação, troca e edição fecham a versão antiga — são fechos,
--        nunca foram cancelamentos; nunca existiu acção de cancelar)
--   54  'cancelado' SEM substituido_em, com prova física de que rodou
--       (km/combustível de saída ou de entrada) → fechado
--   44  'cancelado' SEM substituido_em e sem prova nenhuma → FICAM cancelado
--       (fechados antes de sair; nunca aconteceram)
--
-- CUIDADO COM OS TRIGGERS
-- Um UPDATE em massa de estado_operacional dispara as cascatas. A pior é
-- contrato_renting_inativar_motorista_na_devolucao, que põe status_ativo =
-- false para os condutores do contrato SEM verificar se esse motorista está
-- activo noutro contrato — bastava isto para desactivar meia frota de
-- condutores. Por isso os triggers de utilizador são desligados durante a
-- reclassificação: nenhuma destas linhas precisa de cascata, porque não há
-- transição real de negócio, é só vocabulário a ser corrigido.
-- ============================================================

ALTER TABLE public.contratos_renting DISABLE TRIGGER USER;

-- 1) 'devolvido' era o ciclo da viatura no lugar do do contrato. O facto de
--    ter sido o condutor a entregar passa para tipo_fecho, onde pertence.
UPDATE public.contratos_renting
   SET estado_operacional = 'fechado'::contrato_estado_operacional_enum,
       tipo_fecho         = COALESCE(tipo_fecho, 'devolvido')
 WHERE deleted_at IS NULL
   AND estado_operacional = 'devolvido';

-- 2) Versões substituídas: renovação/troca/edição fecham a versão antiga.
UPDATE public.contratos_renting
   SET estado_operacional = 'fechado'::contrato_estado_operacional_enum
 WHERE deleted_at IS NULL
   AND estado_operacional = 'cancelado'
   AND substituido_em IS NOT NULL;

-- 3) Fechos manuais com prova física de utilização. tipo_fecho fica NULL:
--    não há registo de qual das duas formas foi, e inventar seria pior.
UPDATE public.contratos_renting
   SET estado_operacional = 'fechado'::contrato_estado_operacional_enum
 WHERE deleted_at IS NULL
   AND estado_operacional = 'cancelado'
   AND substituido_em IS NULL
   AND (km_saida IS NOT NULL OR combustivel_saida IS NOT NULL
        OR km_entrada IS NOT NULL OR combustivel_entrada IS NOT NULL);

ALTER TABLE public.contratos_renting ENABLE TRIGGER USER;

-- Os que sobram em 'cancelado' são os que nunca saíram. As suas reservas já
-- foram libertadas por 20260820140200; nada mais a fazer.
