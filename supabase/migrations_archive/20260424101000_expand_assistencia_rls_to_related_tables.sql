-- Expansão das permissões RLS para tabelas relacionadas ao fluxo de assistência
-- Permite que gestores de assistência possam concluir o checkout de viaturas

-- 1. viatura_reparacoes
DROP POLICY IF EXISTS "Permissão para ver viatura_reparacoes" ON public.viatura_reparacoes;
CREATE POLICY "Permissão para ver viatura_reparacoes" ON public.viatura_reparacoes
  FOR SELECT USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao') OR has_permission(auth.uid(), 'assistencia_tickets'));

DROP POLICY IF EXISTS "Permissão para criar viatura_reparacoes" ON public.viatura_reparacoes;
CREATE POLICY "Permissão para criar viatura_reparacoes" ON public.viatura_reparacoes
  FOR INSERT WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao') OR has_permission(auth.uid(), 'assistencia_tickets'));

-- 2. motorista_financeiro
DROP POLICY IF EXISTS "Permissão para ver motorista_financeiro" ON public.motorista_financeiro;
CREATE POLICY "Permissão para ver motorista_financeiro" ON public.motorista_financeiro
  FOR SELECT USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao') OR has_permission(auth.uid(), 'assistencia_tickets'));

DROP POLICY IF EXISTS "Permissão para criar motorista_financeiro" ON public.motorista_financeiro;
CREATE POLICY "Permissão para criar motorista_financeiro" ON public.motorista_financeiro
  FOR INSERT WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao') OR has_permission(auth.uid(), 'assistencia_tickets'));


-- 3. viaturas
DROP POLICY IF EXISTS "Permissão para editar viaturas" ON public.viaturas;
CREATE POLICY "Permissão para editar viaturas" ON public.viaturas
  FOR UPDATE USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao') OR has_permission(auth.uid(), 'assistencia_tickets'));

-- 4. motorista_viaturas
DROP POLICY IF EXISTS "Permissão para criar motorista_viaturas" ON public.motorista_viaturas;
CREATE POLICY "Permissão para criar motorista_viaturas" ON public.motorista_viaturas
  FOR INSERT WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao') OR has_permission(auth.uid(), 'assistencia_tickets'));

DROP POLICY IF EXISTS "Permissão para editar motorista_viaturas" ON public.motorista_viaturas;
CREATE POLICY "Permissão para editar motorista_viaturas" ON public.motorista_viaturas
  FOR UPDATE USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao') OR has_permission(auth.uid(), 'assistencia_tickets'));

-- 5. viatura_danos
DROP POLICY IF EXISTS "Permissão para ver viatura_danos" ON public.viatura_danos;
CREATE POLICY "Permissão para ver viatura_danos" ON public.viatura_danos
  FOR SELECT USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao') OR has_permission(auth.uid(), 'assistencia_tickets'));

DROP POLICY IF EXISTS "Permissão para criar viatura_danos" ON public.viatura_danos;
CREATE POLICY "Permissão para criar viatura_danos" ON public.viatura_danos
  FOR INSERT WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao') OR has_permission(auth.uid(), 'assistencia_tickets'));

DROP POLICY IF EXISTS "Permissão para editar viatura_danos" ON public.viatura_danos;
CREATE POLICY "Permissão para editar viatura_danos" ON public.viatura_danos
  FOR UPDATE USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao') OR has_permission(auth.uid(), 'assistencia_tickets'));

-- 6. viatura_dano_fotos
DROP POLICY IF EXISTS "Permissão para ver fotos de danos" ON public.viatura_dano_fotos;
CREATE POLICY "Permissão para ver fotos de danos" ON public.viatura_dano_fotos
  FOR SELECT USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao') OR has_permission(auth.uid(), 'assistencia_tickets'));

DROP POLICY IF EXISTS "Permissão para criar viatura_dano_fotos" ON public.viatura_dano_fotos;
CREATE POLICY "Permissão para criar viatura_dano_fotos" ON public.viatura_dano_fotos
  FOR INSERT WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao') OR has_permission(auth.uid(), 'assistencia_tickets'));


