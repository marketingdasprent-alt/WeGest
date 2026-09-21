-- O motorista passa a poder registar o KM da viatura por fotografia do
-- odómetro: fotografa, o sistema lê o número, ele confirma (ou corrige), e o
-- KM da viatura é actualizado.
--
-- Guarda-se a leitura E a foto, não só o número final. Quando houver discussão
-- sobre quilómetros — e há sempre, porque deles dependem contratos, franquias
-- e manutenções — é preciso poder ver o que a foto mostrava, o que a máquina
-- leu e o que a pessoa escreveu. Por isso são três campos distintos:
-- `km_lido` (o que a IA extraiu), `km_confirmado` (o que ficou) e `foto_url`.
--
-- A actualização de `viaturas.km_atual` é feita por gatilho e não pelo ecrã:
-- assim qualquer futuro produtor de leituras (o portal, o gestor no BO, um
-- import) actualiza a viatura por arrasto, sem ninguém se lembrar de o fazer.

CREATE TABLE IF NOT EXISTS public.viatura_km_leituras (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL DEFAULT get_current_org_id()
                 REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  viatura_id     uuid NOT NULL REFERENCES public.viaturas(id) ON DELETE CASCADE,
  /** Quem registou, quando veio do portal do motorista. NULL = registo interno. */
  motorista_id   uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,

  /** O que a IA leu na foto. NULL quando a leitura falhou e o número foi
   *  escrito à mão — é isso que distingue "a máquina errou" de "não leu". */
  km_lido        integer,
  /** O que o motorista confirmou. É este que conta e que vai para a viatura. */
  km_confirmado  integer NOT NULL CHECK (km_confirmado >= 0),
  /** KM que a viatura tinha no momento do registo — congela o antes/depois
   *  sem depender de ler o histórico todo para o reconstituir. */
  km_anterior    integer,

  /** Caminho no bucket `viatura-km`. A prova. */
  foto_url       text,

  origem         text NOT NULL DEFAULT 'motorista_portal'
                 CHECK (origem IN ('motorista_portal', 'backoffice', 'import')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS viatura_km_leituras_viatura_idx
  ON public.viatura_km_leituras (viatura_id, created_at DESC);
CREATE INDEX IF NOT EXISTS viatura_km_leituras_motorista_idx
  ON public.viatura_km_leituras (motorista_id, created_at DESC);

-- ── O KM da viatura segue a leitura ────────────────────────────────────────
-- Nunca para trás. O odómetro não recua, e um KM que recua estraga tudo o que
-- se calcula a partir dele — franquias, limites de contrato, manutenções. O
-- ecrã já recusa antes de gravar; isto é a última linha, para o caso de a
-- leitura entrar por outro caminho.
CREATE OR REPLACE FUNCTION public.aplicar_leitura_km()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.viaturas
     SET km_atual = NEW.km_confirmado,
         updated_at = now()
   WHERE id = NEW.viatura_id
     AND (km_atual IS NULL OR km_atual < NEW.km_confirmado);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS viatura_km_leituras_aplica ON public.viatura_km_leituras;
CREATE TRIGGER viatura_km_leituras_aplica
  AFTER INSERT ON public.viatura_km_leituras
  FOR EACH ROW
  EXECUTE FUNCTION public.aplicar_leitura_km();

COMMENT ON TABLE public.viatura_km_leituras IS
  'Leituras do odometro, por fotografia ou a mao. Guarda o que a IA leu, o que a pessoa confirmou e a foto. Um gatilho actualiza viaturas.km_atual, nunca para tras.';

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.viatura_km_leituras ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_deny_anon ON public.viatura_km_leituras
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY rls_org_isolation ON public.viatura_km_leituras
  AS RESTRICTIVE TO authenticated
  USING (org_id = get_current_org_id())
  WITH CHECK (org_id IS NULL OR org_id = get_current_org_id());

-- O motorista regista e vê o que é DELE. Sem isto o portal não escreve: o
-- cargo "Motorista" não tem nenhum recurso de backoffice atribuído.
CREATE POLICY km_leituras_motorista_insert ON public.viatura_km_leituras
  FOR INSERT TO authenticated
  WITH CHECK (
    motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma WHERE ma.user_id = auth.uid()
    )
  );

CREATE POLICY km_leituras_motorista_select ON public.viatura_km_leituras
  FOR SELECT TO authenticated
  USING (
    motorista_id IN (
      SELECT ma.id FROM public.motoristas_ativos ma WHERE ma.user_id = auth.uid()
    )
  );

-- Backoffice: quem gere viaturas ou motoristas vê tudo o da sua organização.
CREATE POLICY km_leituras_backoffice ON public.viatura_km_leituras
  FOR ALL TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (
      is_current_user_admin()
      OR has_permission(auth.uid(), 'viaturas_ver')
      OR has_permission(auth.uid(), 'motoristas_gestao')
    )
  )
  WITH CHECK (
    org_id = get_current_org_id()
    AND (
      is_current_user_admin()
      OR has_permission(auth.uid(), 'viaturas_ver')
      OR has_permission(auth.uid(), 'motoristas_gestao')
    )
  );

-- ── Bucket das fotos ───────────────────────────────────────────────────────
-- Privado: é uma foto tirada dentro do carro de alguém, não precisa de estar
-- aberta à internet como as de danos (essas são públicas por causa da folha
-- de danos impressa com QR).
INSERT INTO storage.buckets (id, name, public)
VALUES ('viatura-km', 'viatura-km', false)
ON CONFLICT (id) DO NOTHING;

-- O motorista envia para a sua própria pasta e lê o que lá pôs.
DROP POLICY IF EXISTS "km fotos motorista insert" ON storage.objects;
CREATE POLICY "km fotos motorista insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'viatura-km'
    AND (storage.foldername(name))[1] IN (
      SELECT ma.id::text FROM public.motoristas_ativos ma WHERE ma.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "km fotos motorista select" ON storage.objects;
CREATE POLICY "km fotos motorista select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'viatura-km'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT ma.id::text FROM public.motoristas_ativos ma WHERE ma.user_id = auth.uid()
      )
      OR is_current_user_admin()
      OR has_permission(auth.uid(), 'viaturas_ver')
      OR has_permission(auth.uid(), 'motoristas_gestao')
    )
  );
