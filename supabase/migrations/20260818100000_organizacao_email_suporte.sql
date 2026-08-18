-- ============================================================
-- Email de suporte da organização
-- ============================================================
-- Destinatário do aviso de cada novo pedido de informática (ti_tickets).
--
-- Fica em `organizacoes` e não numa tabela de configuração à parte porque é do
-- mesmo nível dos outros dados da organização (nif, morada, telefone) e é
-- editado no mesmo sítio: Configurações → Minha Organização.
--
-- NULL é um estado com significado, não um valor em falta: sem email
-- configurado NÃO se envia aviso nenhum. Também não há valor por omissão —
-- mandar avisos para um endereço adivinhado seria pior do que não mandar.
--
-- Sem alterações de RLS: as políticas de `organizacoes` são por linha e já
-- cobrem esta coluna como cobrem as outras.

ALTER TABLE public.organizacoes
  ADD COLUMN email_suporte text
  CONSTRAINT organizacoes_email_suporte_formato
  CHECK (email_suporte IS NULL OR position('@' in email_suporte) > 1);

COMMENT ON COLUMN public.organizacoes.email_suporte IS
  'Endereço que recebe o aviso de cada novo pedido de informática. NULL = não avisar ninguém.';
