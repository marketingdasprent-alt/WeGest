-- ============================================================
-- Separar o ciclo do CONTRATO do ciclo da VIATURA (parte 1/3: estrutura)
-- ============================================================
-- `contratos_renting.estado_operacional` está declarado no código como
-- "ciclo físico da viatura" (src/types/contratoRenting.ts) mas vive no
-- contrato — e os seus quatro valores são dois vocabulários misturados:
--
--   agendado  → fala do CONTRATO
--   em_curso  → fala de onde está a VIATURA
--   devolvido → fala de onde está a VIATURA
--   cancelado → fala do CONTRATO
--
-- Uma coluna a carregar dois factos ortogonais obriga a escolher um. Foi
-- por isso que o contrato #577 ficou "Devolvido" em vez de fechado: o facto
-- da viatura ocupou o lugar do facto do contrato. E foi por isso que fechar
-- passou a escrever 'cancelado' — a única palavra de contrato que sobrava —
-- deixando 54 contratos que rodaram fora do fecho financeiro, que exclui
-- 'cancelado'.
--
-- A partir daqui o contrato fala só a língua do contrato:
--
--   agendado ──► em_curso ──► fechado   (tipo_fecho: recolhido | devolvido)
--       │
--       └──────────────────► cancelado  (não chegou a acontecer)
--
-- "A viatura voltou?" continua respondido onde sempre foi registado: o
-- evento de `recolha` com realizado_em preenchido. Não se perde nada.
--
-- Esta migração só cria a estrutura. ALTER TYPE ... ADD VALUE não pode ser
-- usado na mesma transação que o cria, por isso as funções e os dados vêm
-- nas migrações 20260820150100 e 20260820150200.
-- ============================================================

ALTER TYPE public.contrato_estado_operacional_enum ADD VALUE IF NOT EXISTS 'fechado';

-- Como o contrato terminou. NÃO é um estado — é uma nota sobre a forma como
-- a viatura regressou, escolhida no diálogo de fecho. Já era recolhida
-- (FecharContratoDialog.tipoEvento) e deitada fora; passa a ser guardada.
ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS tipo_fecho text
  CONSTRAINT contratos_renting_tipo_fecho_check
  CHECK (tipo_fecho IS NULL OR tipo_fecho IN ('recolhido', 'devolvido'));

COMMENT ON COLUMN public.contratos_renting.tipo_fecho IS
  'Como o contrato terminou: recolhido (a empresa foi buscar) ou devolvido '
  '(o condutor entregou). Só preenchido quando estado_operacional = fechado. '
  'Não altera comportamento — é registo.';
