-- Guarda o "VALOR LÍQUIDO A RECEBER" do resumo semanal do motorista — o
-- número do banner azul do relatório, tal e qual, por motorista e por semana.
--
-- Porquê uma tabela nova em vez de uma coluna em motorista_resumo_semanal:
-- essa é escrita pela edge function do fecho, que não tem os ingredientes
-- deste valor (falta-lhe combustível, portagens, gorjetas, recibo verde e
-- recibo importado). E não se pode usar motorista_recibos porque ficheiro_url
-- é NOT NULL — essa tabela é para documentos, e obrigaria a gerar um PDF só
-- para guardar um número.
--
-- Aqui grava-se o valor JÁ CALCULADO pelo ecrã, sem o recalcular em lado
-- nenhum: é a única forma de o histórico não contradizer o que foi mostrado
-- e comunicado ao motorista. Nota que a app tem hoje duas fórmulas de líquido
-- (a da lista de Contas/Resumo e a deste relatório, que desconta caução e
-- seguros); o que fica gravado é a do relatório.

CREATE TABLE public.motorista_liquido_semanal (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL DEFAULT get_current_org_id()
                 REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  motorista_id   uuid NOT NULL REFERENCES public.motoristas_ativos(id) ON DELETE CASCADE,
  motorista_nome text,
  semana_inicio  date NOT NULL,
  semana_fim     date NOT NULL CHECK (semana_fim >= semana_inicio),
  -- Positivo = a receber pelo motorista; negativo = em dívida.
  liquido        numeric(10,2) NOT NULL,
  gravado_em     timestamptz NOT NULL DEFAULT timezone('utc', now()),
  gravado_por    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (motorista_id, semana_inicio)
);

CREATE INDEX motorista_liquido_semanal_por_semana
  ON public.motorista_liquido_semanal (org_id, semana_inicio DESC);

ALTER TABLE public.motorista_liquido_semanal ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_deny_anon ON public.motorista_liquido_semanal
  AS RESTRICTIVE FOR ALL TO anon
  USING (false);

CREATE POLICY rls_org_isolation ON public.motorista_liquido_semanal
  AS RESTRICTIVE FOR ALL TO public
  USING (org_id = get_current_org_id() OR is_decada_ousada_admin());

CREATE POLICY motorista_liquido_semanal_gestao ON public.motorista_liquido_semanal
  AS PERMISSIVE FOR ALL TO public
  USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'administrativo_resumos')
    OR is_decada_ousada_admin()
  );
