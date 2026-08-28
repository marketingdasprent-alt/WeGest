-- Política DELETE para motoristas apagarem seus próprios recibos pendentes
CREATE POLICY "Motoristas podem apagar seus recibos pendentes"
ON motorista_recibos
FOR DELETE
TO public
USING (
  auth.uid() = user_id 
  AND status = 'submetido'
);

-- Política DELETE para admins e gestores
CREATE POLICY "Admins podem apagar motorista_recibos"
ON motorista_recibos
FOR DELETE
TO public
USING (
  is_current_user_admin() 
  OR has_permission(auth.uid(), 'motoristas_gestao'::text)
);