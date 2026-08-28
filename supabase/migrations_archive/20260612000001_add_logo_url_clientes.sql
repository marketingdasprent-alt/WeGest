-- Coluna logo_url na tabela clientes (para empresas emissoras).
-- Usada na geração de PDF: o cabeçalho do contrato usa a logo
-- da empresa emissora em vez da logo estática /Logo.png.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.clientes.logo_url IS
  'URL da logo da empresa (clientes com tipo_cliente=''empresa''). '
  'Usado no cabeçalho dos PDFs gerados quando não há papel_timbrado.';
