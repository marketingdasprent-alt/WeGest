-- Criar função para buscar gestores
CREATE OR REPLACE FUNCTION public.get_gestores()
RETURNS TABLE(nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT nome
  FROM public.profiles
  WHERE nome IS NOT NULL 
    AND cargo IS NOT NULL
    AND cargo != ''
  ORDER BY nome;
$$;