-- Permite criar motoristas/condutores apenas com o nome (reserva provisória).
-- Contratos bloqueados enquanto perfil_rascunho = true.

ALTER TABLE public.motoristas_ativos
  ADD COLUMN IF NOT EXISTS perfil_rascunho BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.motoristas_ativos.perfil_rascunho IS
  'Verdadeiro quando o condutor foi criado apenas com o nome (caução recebida, documentação pendente). Não pode constar em contratos enquanto true.';
