-- Permitir plataformas sem credenciais Bolt obrigatórias
ALTER TABLE public.plataformas_configuracao
  ALTER COLUMN client_id DROP NOT NULL,
  ALTER COLUMN client_secret DROP NOT NULL,
  ALTER COLUMN company_id DROP NOT NULL;

-- Tabela de contas Via Verde
CREATE TABLE public.via_verde_contas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integracao_id UUID NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,
  nome_conta TEXT NOT NULL,
  codigo_rac TEXT NOT NULL,
  ftp_host TEXT NOT NULL,
  ftp_porta INTEGER NOT NULL DEFAULT 21,
  ftp_protocolo TEXT NOT NULL DEFAULT 'ftp',
  ftp_modo_passivo BOOLEAN NOT NULL DEFAULT true,
  ftp_utilizador TEXT NOT NULL,
  ftp_password TEXT NOT NULL,
  ftp_ativo BOOLEAN NOT NULL DEFAULT true,
  sync_email TEXT NOT NULL,
  sync_password TEXT NOT NULL,
  sync_ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT via_verde_contas_ftp_porta_check CHECK (ftp_porta BETWEEN 1 AND 65535),
  CONSTRAINT via_verde_contas_ftp_protocolo_check CHECK (ftp_protocolo IN ('ftp', 'sftp')),
  CONSTRAINT via_verde_contas_nome_len_check CHECK (char_length(trim(nome_conta)) BETWEEN 1 AND 120),
  CONSTRAINT via_verde_contas_codigo_rac_len_check CHECK (char_length(trim(codigo_rac)) BETWEEN 1 AND 60),
  CONSTRAINT via_verde_contas_ftp_host_len_check CHECK (char_length(trim(ftp_host)) BETWEEN 1 AND 255),
  CONSTRAINT via_verde_contas_ftp_user_len_check CHECK (char_length(trim(ftp_utilizador)) BETWEEN 1 AND 255),
  CONSTRAINT via_verde_contas_sync_email_len_check CHECK (char_length(trim(sync_email)) BETWEEN 3 AND 255)
);

CREATE INDEX idx_via_verde_contas_integracao_id ON public.via_verde_contas(integracao_id);
CREATE INDEX idx_via_verde_contas_integracao_nome ON public.via_verde_contas(integracao_id, nome_conta);

ALTER TABLE public.via_verde_contas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerir contas Via Verde"
ON public.via_verde_contas
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_current_user_admin())
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_current_user_admin());

CREATE TRIGGER update_via_verde_contas_updated_at
BEFORE UPDATE ON public.via_verde_contas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();