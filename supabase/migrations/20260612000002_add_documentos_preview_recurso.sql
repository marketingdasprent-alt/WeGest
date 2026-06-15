-- Permissão granular para pré-visualizar templates de documentos
-- sem acesso completo a admin_documentos (sem criar/editar/duplicar).
INSERT INTO public.recursos (nome, categoria, descricao)
VALUES (
  'admin_documentos_preview',
  'Administração',
  'Pré-visualizar templates de documentos sem precisar de abrir um contrato'
)
ON CONFLICT (nome) DO NOTHING;
