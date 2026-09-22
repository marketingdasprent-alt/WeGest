-- O motorista passa a poder ler os seus próprios resumos semanais.
--
-- `motorista_liquido_semanal` guarda o valor de cada semana — 858 linhas em
-- produção — e é dele que sai o que o motorista recebe. Mas as políticas
-- exigiam `administrativo_resumos` ou admin, ou seja: o dono do número não o
-- podia ver.
--
-- É o que faltava ao cartão "Relatórios" do portal, que prometia "os seus
-- resumos semanais aparecerão aqui" e mostrava sempre vazio — procurava PDFs
-- em `motorista_recibos` com tipo 'relatorio', dos quais existem zero, quando
-- o histórico real estava aqui ao lado e fechado à chave.
--
-- Só leitura, e só as suas.

CREATE POLICY liquido_semanal_motorista_ve_os_seus ON public.motorista_liquido_semanal
  FOR SELECT TO authenticated
  USING (
    motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma WHERE ma.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
