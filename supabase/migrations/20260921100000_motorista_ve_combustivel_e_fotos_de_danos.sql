-- O motorista passa a ver o que é dele: o combustível que meteu e as
-- fotografias dos danos da sua viatura.
--
-- Os dois cartões do portal estavam vazios para toda a gente, e não por falta
-- de dados — por RLS. As tabelas de combustível exigem `can_view_financeiro()`
-- (admin ou permissão `financeiro_recibos`) e `viatura_dano_fotos` exige
-- `viaturas_ver` ou `motoristas_gestao`. Nenhuma delas o cargo "Motorista"
-- tem: verificado em produção, esse cargo não tem UM ÚNICO recurso com
-- acesso, e os 48 utilizadores ligados a fichas de motorista têm todos
-- `is_admin = false`.
--
-- Resultado: 147 transações de combustível dos motoristas com conta
-- (134 EDP, 13 Repsol) que nenhum deles conseguia ver, e danos que apareciam
-- no painel sem as fotos que os provam.
--
-- A regra aqui é a mesma que `motorista_financeiro` já usa e que funciona:
-- vê as linhas cujo `motorista_id` é a ficha ligada a `auth.uid()`. Só
-- leitura — escrever continua a ser do backoffice.

-- ── Combustível e portagens ────────────────────────────────────────────────
-- Uma política por tabela, todas com a mesma forma. São PERMISSIVE: somam-se
-- às que já existem, não tiram nada a quem já via.
CREATE POLICY combustivel_motorista_ve_o_seu ON public.bp_transacoes
  FOR SELECT TO authenticated
  USING (
    motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma WHERE ma.user_id = auth.uid()
    )
  );

CREATE POLICY combustivel_motorista_ve_o_seu ON public.repsol_transacoes
  FOR SELECT TO authenticated
  USING (
    motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma WHERE ma.user_id = auth.uid()
    )
  );

CREATE POLICY combustivel_motorista_ve_o_seu ON public.edp_transacoes
  FOR SELECT TO authenticated
  USING (
    motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma WHERE ma.user_id = auth.uid()
    )
  );

-- Portagens: ainda não têm cartão no portal, mas entram no líquido semanal.
-- A política fica criada para o cartão não nascer outra vez vazio.
CREATE POLICY portagens_motorista_ve_as_suas ON public.via_verde_transacoes
  FOR SELECT TO authenticated
  USING (
    motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma WHERE ma.user_id = auth.uid()
    )
  );

-- ── Fotos dos danos ────────────────────────────────────────────────────────
-- `viatura_danos` já tem "Motorista ve os danos da sua viatura"; as fotos
-- ficaram de fora e o motorista via a descrição do dano sem a prova. Segue a
-- mesma regra: as fotos dos danos da viatura que lhe está atribuída.
CREATE POLICY dano_fotos_motorista_ve_as_da_sua_viatura ON public.viatura_dano_fotos
  FOR SELECT TO authenticated
  USING (
    dano_id IN (
      SELECT d.id
      FROM public.viatura_danos d
      JOIN public.motorista_viaturas mv ON mv.viatura_id = d.viatura_id
      JOIN public.motoristas_ativos ma ON ma.id = mv.motorista_id
      WHERE ma.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
