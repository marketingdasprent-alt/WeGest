-- Uma conta de plataforma nova passa a ligar-se sozinha ao motorista.
--
-- Até aqui o mapeamento era SEMPRE manual: o trigger consultava
-- motorista_plataforma_identidades e, não encontrando, deixava motorista_id a
-- NULL para sempre. Ninguém ia lá mapear, e acumularam-se 52 contas Bolt
-- órfãs com 20 mil euros de ganhos por atribuir. Pior: a lista de Contas
-- tapava o buraco colando essas linhas a quem tivesse nome parecido, o que
-- dava receita alheia a motoristas reais — o caso "Fabio Silva" somado ao
-- Fábio Queirós, 198,45 € numa semana.
--
-- Agora, quando o identificador é desconhecido, tenta-se pelo nome — com duas
-- travas que a heurística do ecrã não tinha:
--
--   1. O nome tem de ser IGUAL, normalizado (norm_nome_match: minúsculas, sem
--      acentos, espaços colapsados). Não basta conter: "Fabio Silva" não casa
--      com "Fabio Xavier da Silva Gomes Queirós", e é isso que se quer — esse
--      caso exige uma pessoa a decidir.
--   2. Tem de haver EXACTAMENTE UM motorista com esse nome na organização.
--      Com dois homónimos não se adivinha: fica por atribuir, visível.
--
-- O que resolve fica gravado em motorista_plataforma_identidades com
-- origem='auto_nome': auditável e reversível, ao contrário de uma heurística
-- escondida no ecrã, que não deixa rasto e recomeça a cada render. A partir
-- daí a conta resolve pelo identificador e nunca mais se compara nomes.
--
-- O que não casar continua a NULL, de propósito: uma conta por atribuir tem
-- de se ver, não de ser adivinhada.
--
-- NOTA: array_agg e não min() — min(uuid) não existe no Postgres, e a
-- primeira versão desta função rebentava em qualquer INSERT com identificador
-- desconhecido, ou seja, na própria sincronização dos resumos.

CREATE OR REPLACE FUNCTION public.tg_resolver_motorista_plataforma()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id         text;
  v_nome       text;
  v_resolvido  uuid;
  v_candidatos uuid[];
BEGIN
  -- to_jsonb(NEW) devolve NULL para um campo que não exista, em vez de
  -- rebentar. É o que permite a mesma função servir bolt e uber.
  v_id := CASE TG_ARGV[0]
            WHEN 'bolt' THEN to_jsonb(NEW) ->> 'identificador_motorista'
            ELSE to_jsonb(NEW) ->> 'uber_driver_id'
          END;

  v_resolvido := public.resolver_motorista_por_plataforma(NEW.org_id, TG_ARGV[0], v_id);

  -- Identificador desconhecido: tenta pelo nome, e só com nome igual e único.
  IF v_resolvido IS NULL AND v_id IS NOT NULL AND v_id <> '' THEN
    v_nome := to_jsonb(NEW) ->> 'motorista_nome';

    IF v_nome IS NOT NULL AND public.norm_nome_match(v_nome) <> '' THEN
      SELECT array_agg(m.id) INTO v_candidatos
      FROM public.motoristas_ativos m
      WHERE m.org_id = NEW.org_id
        AND public.norm_nome_match(m.nome) = public.norm_nome_match(v_nome);

      -- Exactamente um: com dois homónimos não se adivinha.
      IF array_length(v_candidatos, 1) = 1 THEN
        v_resolvido := v_candidatos[1];
        INSERT INTO public.motorista_plataforma_identidades
          (org_id, motorista_id, plataforma, identificador, origem)
        VALUES (NEW.org_id, v_resolvido, TG_ARGV[0], v_id, 'auto_nome')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  IF v_resolvido IS NOT NULL OR TG_OP = 'INSERT' OR public.recalculo_e_forcado() THEN
    NEW.motorista_id := v_resolvido;
  ELSE
    NEW.motorista_id := OLD.motorista_id;
  END IF;

  RETURN NEW;
END $$;
