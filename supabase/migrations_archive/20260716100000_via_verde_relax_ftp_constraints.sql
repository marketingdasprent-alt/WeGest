-- Via Verde: permitir guardar conta SEM credenciais FTP
-- (apenas credenciais do portal sync_email/sync_password são obrigatórias
--  para o robô Apify). Antes a BD exigia ftp_host e ftp_utilizador preenchidos.
--
-- Not NULL permanece (string vazia '' é value, não NULL), mas as CHECKs
-- de comprimento mínimo são relaxadas para permitir ''.

ALTER TABLE public.via_verde_contas
  DROP CONSTRAINT IF EXISTS via_verde_contas_ftp_host_len_check;

ALTER TABLE public.via_verde_contas
  DROP CONSTRAINT IF EXISTS via_verde_contas_ftp_user_len_check;

ALTER TABLE public.via_verde_contas
  ADD CONSTRAINT via_verde_contas_ftp_host_len_check
  CHECK (char_length(trim(ftp_host)) BETWEEN 0 AND 255);

ALTER TABLE public.via_verde_contas
  ADD CONSTRAINT via_verde_contas_ftp_user_len_check
  CHECK (char_length(trim(ftp_utilizador)) BETWEEN 0 AND 255);
