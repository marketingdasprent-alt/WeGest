-- Quem submeteu o ticket (com sessao) tambem precisa de conseguir abrir o
-- proprio anexo — ate agora so quem gere tickets tinha SELECT no bucket.
CREATE POLICY ti_ticket_anexos_storage_select_proprio ON storage.objects
  FOR SELECT TO public
  USING (
    bucket_id = 'ti-ticket-anexos'
    AND (split_part(name, '/', 1))::uuid IN (
      SELECT id FROM public.ti_tickets WHERE criado_por = auth.uid()
    )
  );
