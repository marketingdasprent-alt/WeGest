-- ============================================================
-- Separar viaturas COMERCIAIS dos PASSAGEIROS + preencher km incluídos
-- ------------------------------------------------------------
-- Problema: a sync da tabela DASP (20260612000001) criou grupos só por
-- diária (G45…G300), misturando comerciais e passageiros (ex.: Jumper e
-- BMW 118d ambos em G90). E nunca preencheu kms_incluidos (ficou NULL).
--
-- Esta migração:
--   1. Cria 6 grupos comerciais (GC50…GC140) marcados tipo "Comercial".
--   2. Move as tarifas e viaturas comerciais para esses grupos.
--   3. Marca os grupos restantes (G*) como "Ligeira RENT".
--   4. Preenche kms_incluidos dos passageiros (km Mensal da tabela Distância).
--      Comerciais e passageiros sem valor ficam NULL (= ilimitado).
--   5. Desativa o G50 se ficar vazio.
--
-- Idempotente: seguro correr múltiplas vezes (find-or-create; só preenche
-- campos vazios; só move quem ainda está no grupo antigo).
-- ============================================================

DO $$
DECLARE
  v_org_id uuid;

  t_comercial uuid;
  t_ligeira   uuid;

  -- Grupos antigos (origem das comerciais)
  g50 uuid; g55 uuid; g70 uuid; g90 uuid; g120 uuid; g140 uuid;
  -- Grupos de passageiros usados no preenchimento de km
  g45 uuid; g65 uuid; g80 uuid; g85 uuid; g95 uuid;

  -- Grupos comerciais novos
  gc50 uuid; gc55 uuid; gc70 uuid; gc90 uuid; gc120 uuid; gc140 uuid;

  v_rows int;
  c_grupos   int := 0;
  c_tarifas  int := 0;
  c_viaturas int := 0;
  c_km       int := 0;
BEGIN
  -- ----------------------------------------------------------
  -- 0. ORG
  -- ----------------------------------------------------------
  SELECT id INTO v_org_id FROM public.organizacoes ORDER BY created_at LIMIT 1;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Nenhuma organização encontrada'; END IF;

  -- ----------------------------------------------------------
  -- 1. TIPOS DE VIATURA (find-or-create p/ a org)
  -- ----------------------------------------------------------
  SELECT id INTO t_comercial FROM public.viatura_tipos
    WHERE lower(trim(nome)) = 'comercial' AND (org_id = v_org_id OR org_id IS NULL)
    ORDER BY (org_id = v_org_id) DESC NULLS LAST LIMIT 1;
  IF t_comercial IS NULL THEN
    INSERT INTO public.viatura_tipos(org_id, nome) VALUES (v_org_id, 'Comercial') RETURNING id INTO t_comercial;
  END IF;

  SELECT id INTO t_ligeira FROM public.viatura_tipos
    WHERE lower(trim(nome)) = 'ligeira rent' AND (org_id = v_org_id OR org_id IS NULL)
    ORDER BY (org_id = v_org_id) DESC NULLS LAST LIMIT 1;
  IF t_ligeira IS NULL THEN
    INSERT INTO public.viatura_tipos(org_id, nome) VALUES (v_org_id, 'Ligeira RENT') RETURNING id INTO t_ligeira;
  END IF;

  -- ----------------------------------------------------------
  -- 2. GRUPOS ANTIGOS (origem)
  -- ----------------------------------------------------------
  SELECT id INTO g50  FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'G50';
  SELECT id INTO g55  FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'G55';
  SELECT id INTO g70  FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'G70';
  SELECT id INTO g90  FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'G90';
  SELECT id INTO g120 FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'G120';
  SELECT id INTO g140 FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'G140';
  SELECT id INTO g45  FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'G45';
  SELECT id INTO g65  FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'G65';
  SELECT id INTO g80  FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'G80';
  SELECT id INTO g85  FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'G85';
  SELECT id INTO g95  FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'G95';

  -- ----------------------------------------------------------
  -- 3. GRUPOS COMERCIAIS (find-or-create, tipo = Comercial)
  -- ----------------------------------------------------------
  SELECT id INTO gc50 FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'GC50';
  IF gc50 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao,tipo_id)
    VALUES(v_org_id,'Comercial 50€/dia','GC50','Fiat Doblò',t_comercial) RETURNING id INTO gc50; c_grupos:=c_grupos+1; END IF;

  SELECT id INTO gc55 FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'GC55';
  IF gc55 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao,tipo_id)
    VALUES(v_org_id,'Comercial 55€/dia','GC55','Fiat Doblò Longa',t_comercial) RETURNING id INTO gc55; c_grupos:=c_grupos+1; END IF;

  SELECT id INTO gc70 FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'GC70';
  IF gc70 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao,tipo_id)
    VALUES(v_org_id,'Comercial 70€/dia','GC70','Fiat Scudo · Opel Vivaro · Peugeot Expert',t_comercial) RETURNING id INTO gc70; c_grupos:=c_grupos+1; END IF;

  SELECT id INTO gc90 FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'GC90';
  IF gc90 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao,tipo_id)
    VALUES(v_org_id,'Comercial 90€/dia','GC90','Citroën Jumper · Fiat Ducato Furgão · Opel Movano Van · Peugeot Boxer',t_comercial) RETURNING id INTO gc90; c_grupos:=c_grupos+1; END IF;

  SELECT id INTO gc120 FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'GC120';
  IF gc120 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao,tipo_id)
    VALUES(v_org_id,'Comercial 120€/dia','GC120','Opel Movano (Caixa Aberta)',t_comercial) RETURNING id INTO gc120; c_grupos:=c_grupos+1; END IF;

  SELECT id INTO gc140 FROM public.renting_grupos WHERE org_id = v_org_id AND codigo = 'GC140';
  IF gc140 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao,tipo_id)
    VALUES(v_org_id,'Comercial 140€/dia','GC140','Fiat Ducato Contentor · Renault Master Contentor',t_comercial) RETURNING id INTO gc140; c_grupos:=c_grupos+1; END IF;

  -- Garantir tipo_id nos comerciais (caso já existissem sem tipo)
  UPDATE public.renting_grupos SET tipo_id = t_comercial
    WHERE org_id = v_org_id AND codigo IN ('GC50','GC55','GC70','GC90','GC120','GC140') AND tipo_id IS DISTINCT FROM t_comercial;

  -- Marcar grupos restantes (G45…G300, NÃO os GC*) como Ligeira RENT, sem sobrescrever escolhas
  UPDATE public.renting_grupos SET tipo_id = t_ligeira
    WHERE org_id = v_org_id AND codigo ~ '^G[0-9]' AND tipo_id IS NULL;

  -- ----------------------------------------------------------
  -- 4. MOVER TARIFAS COMERCIAIS → grupos comerciais
  --    (só move as que ainda estão no grupo antigo)
  -- ----------------------------------------------------------
  UPDATE public.renting_tarifas SET grupo_id = gc50 WHERE org_id = v_org_id AND grupo_id = g50
    AND lower(nome) LIKE '%dobl%' AND lower(nome) NOT LIKE '%longa%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_tarifas := c_tarifas + v_rows;

  UPDATE public.renting_tarifas SET grupo_id = gc55 WHERE org_id = v_org_id AND grupo_id = g55
    AND lower(nome) LIKE '%dobl%longa%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_tarifas := c_tarifas + v_rows;

  UPDATE public.renting_tarifas SET grupo_id = gc70 WHERE org_id = v_org_id AND grupo_id = g70
    AND (lower(nome) LIKE '%scudo%' OR lower(nome) LIKE '%vivaro%' OR lower(nome) LIKE '%expert%');
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_tarifas := c_tarifas + v_rows;

  UPDATE public.renting_tarifas SET grupo_id = gc90 WHERE org_id = v_org_id AND grupo_id = g90
    AND (lower(nome) LIKE '%jumper%' OR lower(nome) LIKE '%ducato furg%'
         OR lower(nome) LIKE '%movano van%' OR lower(nome) LIKE '%boxer%');
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_tarifas := c_tarifas + v_rows;

  UPDATE public.renting_tarifas SET grupo_id = gc120 WHERE org_id = v_org_id AND grupo_id = g120
    AND lower(nome) LIKE '%movano%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_tarifas := c_tarifas + v_rows;

  UPDATE public.renting_tarifas SET grupo_id = gc140 WHERE org_id = v_org_id AND grupo_id = g140
    AND (lower(nome) LIKE '%ducato cont%' OR lower(nome) LIKE '%master%');
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_tarifas := c_tarifas + v_rows;

  -- ----------------------------------------------------------
  -- 5. MOVER VIATURAS COMERCIAIS → grupos comerciais
  --    (match por marca+modelo TEXT; só as que estão no grupo antigo ou sem grupo)
  -- ----------------------------------------------------------
  -- Fiat Doblò (não longa) → GC50
  UPDATE public.viaturas SET grupo_id = gc50 WHERE org_id = v_org_id AND (grupo_id = g50 OR grupo_id IS NULL)
    AND lower(trim(marca)) LIKE '%fiat%' AND lower(trim(modelo)) LIKE '%dobl%' AND lower(trim(modelo)) NOT LIKE '%longa%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas := c_viaturas + v_rows;

  -- Fiat Doblò Longa → GC55
  UPDATE public.viaturas SET grupo_id = gc55 WHERE org_id = v_org_id AND (grupo_id = g55 OR grupo_id IS NULL)
    AND lower(trim(marca)) LIKE '%fiat%' AND lower(trim(modelo)) LIKE '%dobl%longa%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas := c_viaturas + v_rows;

  -- Fiat Scudo → GC70
  UPDATE public.viaturas SET grupo_id = gc70 WHERE org_id = v_org_id AND (grupo_id = g70 OR grupo_id IS NULL)
    AND lower(trim(marca)) LIKE '%fiat%' AND lower(trim(modelo)) LIKE '%scudo%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas := c_viaturas + v_rows;

  -- Opel Vivaro → GC70
  UPDATE public.viaturas SET grupo_id = gc70 WHERE org_id = v_org_id AND (grupo_id = g70 OR grupo_id IS NULL)
    AND lower(trim(marca)) LIKE '%opel%' AND lower(trim(modelo)) LIKE '%vivaro%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas := c_viaturas + v_rows;

  -- Peugeot Expert → GC70
  UPDATE public.viaturas SET grupo_id = gc70 WHERE org_id = v_org_id AND (grupo_id = g70 OR grupo_id IS NULL)
    AND lower(trim(marca)) LIKE '%peugeot%' AND lower(trim(modelo)) LIKE '%expert%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas := c_viaturas + v_rows;

  -- Citroën Jumper → GC90
  UPDATE public.viaturas SET grupo_id = gc90 WHERE org_id = v_org_id AND (grupo_id = g90 OR grupo_id IS NULL)
    AND lower(trim(marca)) LIKE '%citro%' AND lower(trim(modelo)) LIKE '%jumper%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas := c_viaturas + v_rows;

  -- Fiat Ducato Furgão → GC90
  UPDATE public.viaturas SET grupo_id = gc90 WHERE org_id = v_org_id AND (grupo_id = g90 OR grupo_id IS NULL)
    AND lower(trim(marca)) LIKE '%fiat%' AND lower(trim(modelo)) LIKE '%ducato%furg%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas := c_viaturas + v_rows;

  -- Opel Movano Van → GC90 (antes do Movano genérico)
  UPDATE public.viaturas SET grupo_id = gc90 WHERE org_id = v_org_id AND (grupo_id = g90 OR grupo_id IS NULL)
    AND lower(trim(marca)) LIKE '%opel%' AND lower(trim(modelo)) LIKE '%movano%van%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas := c_viaturas + v_rows;

  -- Peugeot Boxer → GC90
  UPDATE public.viaturas SET grupo_id = gc90 WHERE org_id = v_org_id AND (grupo_id = g90 OR grupo_id IS NULL)
    AND lower(trim(marca)) LIKE '%peugeot%' AND lower(trim(modelo)) LIKE '%boxer%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas := c_viaturas + v_rows;

  -- Opel Movano (Caixa Aberta, não Van) → GC120
  UPDATE public.viaturas SET grupo_id = gc120 WHERE org_id = v_org_id AND (grupo_id = g120 OR grupo_id IS NULL)
    AND lower(trim(marca)) LIKE '%opel%' AND lower(trim(modelo)) LIKE '%movano%' AND lower(trim(modelo)) NOT LIKE '%van%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas := c_viaturas + v_rows;

  -- Fiat Ducato Contentor → GC140
  UPDATE public.viaturas SET grupo_id = gc140 WHERE org_id = v_org_id AND (grupo_id = g140 OR grupo_id IS NULL)
    AND lower(trim(marca)) LIKE '%fiat%' AND lower(trim(modelo)) LIKE '%ducato%cont%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas := c_viaturas + v_rows;

  -- Renault Master Contentor → GC140
  UPDATE public.viaturas SET grupo_id = gc140 WHERE org_id = v_org_id AND (grupo_id = g140 OR grupo_id IS NULL)
    AND lower(trim(marca)) LIKE '%renault%' AND lower(trim(modelo)) LIKE '%master%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas := c_viaturas + v_rows;

  -- ----------------------------------------------------------
  -- 6. PREENCHER kms_incluidos DOS PASSAGEIROS (km Mensal · Distância)
  --    Só preenche se ainda estiver NULL. Comerciais e sem-valor ficam NULL.
  -- ----------------------------------------------------------
  -- G45
  UPDATE public.renting_tarifas SET kms_incluidos = 10000 WHERE org_id=v_org_id AND grupo_id=g45 AND lower(nome) LIKE '%panda%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  -- G55 (passageiros)
  UPDATE public.renting_tarifas SET kms_incluidos = 12000 WHERE org_id=v_org_id AND grupo_id=g55 AND lower(nome) LIKE '%corsa%diesel%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 12000 WHERE org_id=v_org_id AND grupo_id=g55 AND lower(nome) LIKE '%clio%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  -- G65
  UPDATE public.renting_tarifas SET kms_incluidos = 10000 WHERE org_id=v_org_id AND grupo_id=g65 AND lower(nome) LIKE '%tipo%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 10000 WHERE org_id=v_org_id AND grupo_id=g65 AND lower(nome) LIKE '%corsa%el%trico%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 6000  WHERE org_id=v_org_id AND grupo_id=g65 AND lower(nome) LIKE '%208%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  -- G70 (passageiro: Jogger)
  UPDATE public.renting_tarifas SET kms_incluidos = 10000 WHERE org_id=v_org_id AND grupo_id=g70 AND lower(nome) LIKE '%jogger%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  -- G80
  UPDATE public.renting_tarifas SET kms_incluidos = 12000 WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%c4%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 10000 WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%grande panda%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 12000 WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%ceed%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 12000 WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%qashqai%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 10000 WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%grandland%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 9000  WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%g%ne%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 12000 WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%leon%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  -- G85
  UPDATE public.renting_tarifas SET kms_incluidos = 12000 WHERE org_id=v_org_id AND grupo_id=g85 AND lower(nome) LIKE '%astra%diesel%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 9000  WHERE org_id=v_org_id AND grupo_id=g85 AND lower(nome) LIKE '%308%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  -- G90 (passageiros)
  UPDATE public.renting_tarifas SET kms_incluidos = 7500  WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%116%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 7500  WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%c4%el%trico%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 6500  WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%classe a%180%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 12000 WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%astra%h%brido%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 9000  WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%mokka%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 10000 WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%2008%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  -- G95
  UPDATE public.renting_tarifas SET kms_incluidos = 7500  WHERE org_id=v_org_id AND grupo_id=g95 AND lower(nome) LIKE '%216%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 10000 WHERE org_id=v_org_id AND grupo_id=g95 AND lower(nome) LIKE '%astra%el%trico%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 6000  WHERE org_id=v_org_id AND grupo_id=g95 AND lower(nome) LIKE '%e%308%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  -- G120 (passageiros)
  UPDATE public.renting_tarifas SET kms_incluidos = 7500  WHERE org_id=v_org_id AND grupo_id=g120 AND lower(nome) LIKE '%530%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 7500  WHERE org_id=v_org_id AND grupo_id=g120 AND lower(nome) LIKE '%cla%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  -- G125
  UPDATE public.renting_tarifas SET kms_incluidos = 6500  WHERE org_id=v_org_id AND grupo_id=(SELECT id FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G125') AND lower(nome) LIKE '%250e%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  -- G140 (passageiros)
  UPDATE public.renting_tarifas SET kms_incluidos = 6500  WHERE org_id=v_org_id AND grupo_id=g140 AND lower(nome) LIKE '%300%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 9000  WHERE org_id=v_org_id AND grupo_id=g140 AND lower(nome) LIKE '%model 3%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  -- G160 / G180
  UPDATE public.renting_tarifas SET kms_incluidos = 6500  WHERE org_id=v_org_id AND grupo_id=(SELECT id FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G160') AND lower(nome) LIKE '%vito%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;
  UPDATE public.renting_tarifas SET kms_incluidos = 6500  WHERE org_id=v_org_id AND grupo_id=(SELECT id FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G180') AND lower(nome) LIKE '%klasse%' AND kms_incluidos IS NULL;  GET DIAGNOSTICS v_rows=ROW_COUNT; c_km:=c_km+v_rows;

  -- ----------------------------------------------------------
  -- 7. DESATIVAR G50 se ficou vazio (só tinha o Doblò)
  -- ----------------------------------------------------------
  UPDATE public.renting_grupos SET ativo = false
    WHERE id = g50 AND NOT EXISTS (SELECT 1 FROM public.renting_tarifas WHERE grupo_id = g50);

  -- ----------------------------------------------------------
  -- RELATÓRIO
  -- ----------------------------------------------------------
  RAISE NOTICE '==========================================';
  RAISE NOTICE '  SEPARAR COMERCIAIS + KM INCLUÍDOS';
  RAISE NOTICE '------------------------------------------';
  RAISE NOTICE '  Grupos comerciais criados : %', c_grupos;
  RAISE NOTICE '  Tarifas movidas (comerc.) : %', c_tarifas;
  RAISE NOTICE '  Viaturas movidas (comerc.): %', c_viaturas;
  RAISE NOTICE '  Tarifas com km preenchido : %', c_km;
  RAISE NOTICE '==========================================';
END $$;
