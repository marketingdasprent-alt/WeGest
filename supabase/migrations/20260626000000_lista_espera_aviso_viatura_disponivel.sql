-- ============================================================
-- Lista de espera → aviso popup quando uma viatura (marca+modelo) fica disponível
-- ============================================================
-- Objetivo:
--   Cada entrada da lista de espera (calendario_eventos.tipo = 'lista_espera')
--   guarda em `titulo` a marca+modelo desejada e em `criado_por` o gestor.
--   Quando existir PELO MENOS UMA viatura dessa marca+modelo TOTALMENTE LIVRE
--   (sem reserva, contrato, movimento/reparação nem motorista TVDE/slot ativos),
--   cria-se uma notificação 'viatura_disponivel' DIRIGIDA ao gestor criador.
--   O popup já existente (NotificacoesPopup) mostra-a e fica visível até o gestor
--   a fechar (dispensa pessoal, via resolver_notificacao).
--
-- Deteção: função SQL corrida por pg_cron de poucos em poucos minutos.
--
-- Idempotente e aditiva (segura para correr em produção).
-- ============================================================

-- 1. Extensões à tabela `notificacoes` --------------------------------------
--    - novo tipo 'viatura_disponivel'
--    - destinatário por UTILIZADOR (o gestor criador) — hoje a tabela só
--      endereça por cargo; esta coluna permite dirigir a uma pessoa.
--    - link de destino (rota) — o popup atual só sabia ligar a candidaturas.
--    - evento_id — liga o aviso à entrada da lista de espera (anti-duplicação).

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS destinatario_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS evento_id uuid REFERENCES public.calendario_eventos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notificacoes_destinatario
  ON public.notificacoes(destinatario_user_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_evento
  ON public.notificacoes(evento_id);

-- Atualizar o CHECK do `tipo` para incluir 'viatura_disponivel'.
-- (Recriar a constraint de forma idempotente — o nome gerado pelo Postgres é
--  notificacoes_tipo_check.)
DO $$
DECLARE
  c record;
BEGIN
  -- Remover QUALQUER CHECK constraint atual sobre a coluna `tipo` (seja qual for
  -- o nome com que foi criada na BD) — evita ficar uma constraint antiga
  -- "fantasma" a bloquear o novo valor. Procura constraints CHECK cuja definição
  -- mencione a coluna tipo.
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.notificacoes'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.notificacoes DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.notificacoes
    ADD CONSTRAINT notificacoes_tipo_check
    CHECK (tipo IN ('motorista_pendente', 'escalonamento', 'viatura_disponivel'));
END $$;

-- 2. RLS: ver também as notificações dirigidas a MIM --------------------------
--    Mantém as regras por cargo existentes e acrescenta o caso por utilizador.
DROP POLICY IF EXISTS "ver notificacoes do meu cargo" ON public.notificacoes;
CREATE POLICY "ver notificacoes do meu cargo" ON public.notificacoes
  FOR SELECT
  USING (
    NOT public.notificacao_dispensada(id)
    AND (
      -- Notificações dirigidas diretamente a este utilizador (ex.: lista de espera).
      (destinatario_user_id IS NOT NULL AND destinatario_user_id = auth.uid())
      OR
      -- Regras antigas, por cargo + org (inalteradas).
      (
        (org_id IS NULL OR org_id = get_current_org_id())
        AND (
          (
            tipo = 'motorista_pendente'
            AND (
              is_current_user_admin()
              OR current_user_cargo() IN ('Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE')
            )
          )
          OR (
            tipo = 'escalonamento'
            AND current_user_cargo() = 'Supervisor Gestor TVDE'
          )
        )
      )
    )
  );

-- 3. Função: viatura está TOTALMENTE livre? ----------------------------------
--    "Sem nada": sem reserva, contrato, movimento/reparação nem motorista
--    TVDE/slot ativos. Mesma fonte de verdade do frontend (useViaturasOcupacao).
CREATE OR REPLACE FUNCTION public.viatura_totalmente_livre(p_viatura_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT (
    EXISTS (
      SELECT 1 FROM public.reservas r
      WHERE r.viatura_id = p_viatura_id
        AND r.deleted_at IS NULL
        AND r.estado IN ('pendente', 'confirmada', 'em_curso')
    )
    OR EXISTS (
      SELECT 1 FROM public.contratos_renting c
      WHERE c.viatura_id = p_viatura_id
        AND c.deleted_at IS NULL
        AND c.estado_operacional IN ('agendado', 'em_curso')
    )
    OR EXISTS (
      SELECT 1 FROM public.movimentos m
      WHERE m.viatura_id = p_viatura_id
        AND m.estado IN ('planeado', 'a_decorrer')
    )
    OR EXISTS (
      SELECT 1 FROM public.viatura_reparacoes vr
      WHERE vr.viatura_id = p_viatura_id
        AND vr.data_entrada IS NOT NULL
        AND vr.data_saida IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.motorista_viaturas mv
      WHERE mv.viatura_id = p_viatura_id
        AND mv.status = 'ativo'
        AND mv.data_fim IS NULL
    )
  );
$$;

-- 4. Função principal: varrer a lista de espera e criar avisos ----------------
--    Para cada entrada 'lista_espera', se houver >=1 viatura da marca+modelo
--    indicada (titulo) totalmente livre, e ainda não existir aviso ATIVO para
--    essa entrada, cria a notificação dirigida ao gestor criador.
CREATE OR REPLACE FUNCTION public.verificar_lista_espera_disponibilidade()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entrada record;
  v_matricula_livre text;
  v_criadas integer := 0;
BEGIN
  FOR v_entrada IN
    SELECT id, titulo, criado_por, org_id
    FROM public.calendario_eventos
    WHERE tipo = 'lista_espera'
      AND titulo IS NOT NULL
      AND criado_por IS NOT NULL
  LOOP
    -- Já existe aviso para esta entrada que o gestor AINDA NÃO fechou? Não
    -- duplicar. (O "fechar" é uma dispensa pessoal — não mexe em `resolvida` —
    -- por isso o guard tem de ignorar as já dispensadas pelo destinatário,
    -- senão nunca mais se voltaria a avisar quando a viatura reocupa e liberta.)
    IF EXISTS (
      SELECT 1 FROM public.notificacoes n
      WHERE n.evento_id = v_entrada.id
        AND n.tipo = 'viatura_disponivel'
        AND n.resolvida = false
        AND NOT EXISTS (
          SELECT 1 FROM public.notificacao_dispensas d
          WHERE d.notificacao_id = n.id
            AND d.user_id = v_entrada.criado_por
        )
    ) THEN
      CONTINUE;
    END IF;

    -- Procurar uma viatura da marca+modelo desejada que esteja totalmente livre.
    -- O titulo é "marca modelo" (ex.: "Tesla Model 3"); comparamos sem
    -- diferenças de maiúsculas e colapsando espaços (btrim + colapso interno).
    -- Restringe à org da entrada (multi-tenant): só viaturas da mesma org contam.
    SELECT v.matricula INTO v_matricula_livre
    FROM public.viaturas v
    WHERE v.is_vendida IS NOT TRUE
      AND (v_entrada.org_id IS NULL OR v.org_id = v_entrada.org_id)
      AND lower(regexp_replace(btrim(v.marca || ' ' || v.modelo), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(v_entrada.titulo), '\s+', ' ', 'g'))
      AND public.viatura_totalmente_livre(v.id)
    LIMIT 1;

    IF v_matricula_livre IS NOT NULL THEN
      INSERT INTO public.notificacoes (
        org_id, tipo, evento_id, destinatario_user_id, titulo, mensagem, severidade, link
      )
      VALUES (
        v_entrada.org_id,
        'viatura_disponivel',
        v_entrada.id,
        v_entrada.criado_por,
        'Viatura disponível: ' || v_entrada.titulo,
        'Já existe uma ' || v_entrada.titulo || ' disponível (' || v_matricula_livre ||
          '). Pode avançar com a reserva da lista de espera.',
        'normal',
        '/calendario'
      );
      v_criadas := v_criadas + 1;
    END IF;
  END LOOP;

  RETURN v_criadas;
END;
$$;

-- Sem GRANT a `authenticated`: só o cron (owner) a executa. Evita que um
-- utilizador qualquer force a criação antecipada de avisos a outros gestores.

-- 4b. resolver_notificacao: o DESTINATÁRIO pode fechar a sua própria notificação
--     ------------------------------------------------------------------------
--     A versão anterior só deixava fechar quem tivesse um dos cargos
--     notificáveis. Um aviso 'viatura_disponivel' é dirigido a um gestor
--     específico (destinatario_user_id) que pode ter outro cargo — tem de o
--     poder dispensar. Mantém-se a regra por cargo para os tipos antigos.
CREATE OR REPLACE FUNCTION public.resolver_notificacao(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cargo text;
  v_is_admin boolean;
  v_destinatario uuid;
BEGIN
  v_cargo := current_user_cargo();
  v_is_admin := is_current_user_admin();
  SELECT destinatario_user_id INTO v_destinatario
  FROM public.notificacoes WHERE id = p_id;

  IF NOT (
    v_is_admin
    OR v_cargo IN ('Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE')
    -- O próprio destinatário pode sempre dispensar o que lhe é dirigido.
    OR (v_destinatario IS NOT NULL AND v_destinatario = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para dispensar notificações';
  END IF;

  -- Dispensa apenas para o utilizador atual (não mexe no estado global).
  INSERT INTO public.notificacao_dispensas (notificacao_id, user_id)
  VALUES (p_id, auth.uid())
  ON CONFLICT (notificacao_id, user_id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolver_notificacao(uuid) TO authenticated;

-- 5. Cron: correr a verificação a cada 5 minutos -----------------------------
--    (Idempotente: remove o agendamento anterior com o mesmo nome, se existir.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lista-espera-disponibilidade') THEN
    PERFORM cron.unschedule('lista-espera-disponibilidade');
  END IF;
  PERFORM cron.schedule(
    'lista-espera-disponibilidade',
    '*/5 * * * *',
    $cron$ SELECT public.verificar_lista_espera_disponibilidade(); $cron$
  );
END $$;
