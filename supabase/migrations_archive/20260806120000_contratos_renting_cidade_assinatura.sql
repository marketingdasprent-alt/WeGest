-- ============================================================================
-- contratos_renting.cidade_assinatura — a cidade fica agarrada ao contrato
-- ============================================================================
-- PROBLEMA: nenhuma coluna guardava a "cidade de assinatura" de um contrato
-- de renting. Todos os diálogos que geram documentos (ContratoDocumentosDialog,
-- e a Folha de Danos gerada por FecharContratoDialog) partiam sempre de um
-- campo vazio — mesmo para gerar o 2º, 3º, 10º documento do MESMO contrato,
-- que já tinha sido assinado numa cidade concreta. "Escolher sempre" era
-- literal: não havia onde a escolha anterior pudesse ficar.
--
-- SOLUÇÃO: coluna nullable. ContratoDocumentosDialog passa a gravar aqui a
-- cidade escolhida depois de gerar com sucesso — fica "vigente" — e a
-- pré-preencher o campo a partir daqui da próxima vez. FecharContratoDialog
-- lê-a para a Folha de Danos, sem pedir nada ao utilizador: o fecho de um
-- contrato que já teve documentos gerados não volta a perguntar.
--
-- Contratos que NUNCA passaram por "Gerar Documentos" continuam com esta
-- coluna a NULL — sem regressão, o campo nasce vazio como sempre nasceu.
--
-- Idempotente e aditiva.
-- ============================================================================

alter table public.contratos_renting
  add column if not exists cidade_assinatura text;

comment on column public.contratos_renting.cidade_assinatura is
  'Cidade de assinatura vigente deste contrato. Gravada por ContratoDocumentosDialog '
  'após cada geração bem-sucedida; lida por ele próprio e por FecharContratoDialog '
  '(Folha de Danos) para não voltar a perguntar. NULL até à primeira geração.';
