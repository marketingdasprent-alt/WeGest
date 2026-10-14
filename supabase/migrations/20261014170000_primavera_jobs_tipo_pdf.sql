-- Fila Primavera: novo tipo de job 'pdf', para o botão de imprimir obter o documento pelo agente local.
--
-- O agente chama POST /documentos/vendas/imprimir no AS Connect (provado no servidor real a
-- 14/10/2026) e devolve o PDF em base64. Imprimir não tem efeito fiscal: um pdf reclamado e
-- sem resposta volta à fila como o health (a regra de 'ambiguo' do claim é só para 'emit').

ALTER TABLE public.primavera_jobs DROP CONSTRAINT IF EXISTS primavera_jobs_tipo_check;
ALTER TABLE public.primavera_jobs
  ADD CONSTRAINT primavera_jobs_tipo_check
  CHECK (tipo IN ('emit', 'health', 'pdf'));

NOTIFY pgrst, 'reload schema';
