-- O motorista passa a abrir o resumo completo da semana no app (Receitas,
-- Despesas, Líquido), igual ao que o escritório vê. O escritório já calcula
-- estes números ao fechar a semana e grava o líquido; grava-se agora também a
-- fotografia deles. O motorista só lê a sua linha e só depois de enviada, pela
-- política que já existe (liquido_semanal_motorista_ve_os_seus).
--
-- Só acrescenta uma coluna opcional: nada do que existe muda. As semanas já
-- fechadas ficam sem fotografia até o escritório as abrir de novo em Contas/
-- Resumo (a lista regrava a semana fechada); até lá o app diz que o detalhe
-- ainda não está disponível.

ALTER TABLE public.motorista_liquido_semanal
  ADD COLUMN IF NOT EXISTS detalhe JSONB;

COMMENT ON COLUMN public.motorista_liquido_semanal.detalhe IS
  'Fotografia do resumo da semana (versao 1: receitas, despesas, retencao, liquido), gravada com o liquido para o motorista a abrir no app. NULL = ainda sem detalhe.';

NOTIFY pgrst, 'reload schema';
