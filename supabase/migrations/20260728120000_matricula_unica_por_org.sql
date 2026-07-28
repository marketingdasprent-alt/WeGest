-- Troca a unicidade de matrícula de global para por-organização.
--
-- Motivo: uma viatura pode ser vendida por uma org (ex.: Década Ousada) e
-- comprada por outra (ex.: Urbango). Com UNIQUE(matricula) global, a nova
-- dona ficava bloqueada a registar a viatura até a antiga dona "dar baixa"
-- — o que a tornava refém da diligência administrativa de uma empresa
-- terceira, sem qualquer incentivo para ser rápida. E qualquer aviso
-- cross-org ("esta matrícula já existe na organização X") seria, por si só,
-- uma fuga de dados entre tenants (RGPD).
--
-- Cada organização passa a ser uma "ilha" independente em relação a
-- matrículas: sem bloqueio, sem aviso, sem nenhuma lógica cross-org.

ALTER TABLE public.viaturas DROP CONSTRAINT IF EXISTS viaturas_matricula_key;

ALTER TABLE public.viaturas
  ADD CONSTRAINT viaturas_org_matricula_key UNIQUE (org_id, matricula);
