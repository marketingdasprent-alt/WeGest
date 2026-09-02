-- ============================================================================
-- A cor da marca da organização, e o formulário público a segui-la.
--
-- PORQUÊ
-- O formulário público (`/formulario/:id`) tinha as cores escritas à mão:
-- fundo preto, botões amarelos, e o rodapé a dizer "© 2024 DasPrent". Numa
-- aplicação multi-organização isso significa que a PREMIUM RIDE, a Década
-- Ousada e qualquer cliente novo mostram todos a marca da DasPrent aos leads
-- que angariam — não é só a cor errada, é o nome da empresa errada.
--
-- A tabela `formularios` já sabe a que organização pertence (`org_id`), mas a
-- página é pública: quem a abre é anónimo e não tem — nem deve ter — leitura
-- em `organizacoes`. Por isso a marca tem de viajar pela mesma função que já
-- serve o formulário, `formulario_publico_por_id`, que corre com SECURITY
-- DEFINER e devolve só o que é seguro mostrar.
--
-- Idempotente e aditiva: pode correr mais do que uma vez.
-- ============================================================================

-- ─── 1. Onde a cor vive ─────────────────────────────────────────────────────

ALTER TABLE public.organizacoes
  ADD COLUMN IF NOT EXISTS cor_primaria text;

COMMENT ON COLUMN public.organizacoes.cor_primaria IS
  'Cor da marca em hexadecimal (#RRGGBB). Usada nos ecrãs que o público vê — hoje o formulário público. NULL = usa a cor da aplicação.';

-- Só hexadecimal de 6 dígitos, ou nada. Sem isto, um valor colado à pressa
-- ("azul", "rgb(0,0,0)") ia parar dentro de um style= no HTML do formulário.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizacoes_cor_primaria_hex'
  ) THEN
    ALTER TABLE public.organizacoes
      ADD CONSTRAINT organizacoes_cor_primaria_hex
      CHECK (cor_primaria IS NULL OR cor_primaria ~* '^#[0-9a-f]{6}$');
  END IF;
END $$;

-- ─── 2. A marca viaja com o formulário ──────────────────────────────────────
--
-- Acrescenta `organizacao` à resposta. Só três campos, todos eles públicos por
-- natureza — é o que a organização quer mostrar a quem preenche: o nome, o
-- logótipo e a cor. Nada de NIF, morada, telefone ou email de suporte.

CREATE OR REPLACE FUNCTION public.formulario_publico_por_id(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id',        f.id,
    'nome',      f.nome,
    'descricao', f.descricao,
    'campos',    f.campos,
    'campanhas', coalesce(
      (select jsonb_agg(fc.campanha_tag order by fc.campanha_tag)
         from public.formulario_campanhas fc
        where fc.formulario_id = f.id),
      '[]'::jsonb
    ),
    -- A marca de quem criou o formulário. `null` quando o formulário não tem
    -- organização — o ecrã cai na cor da aplicação, como antes.
    'organizacao', (
      select jsonb_build_object(
        'nome',         o.nome,
        'logo_url',     o.logo_url,
        'cor_primaria', o.cor_primaria
      )
      from public.organizacoes o
      where o.id = f.org_id
    )
  )
  from public.formularios f
  where f.id = p_id
    and f.ativo = true;
$function$;
