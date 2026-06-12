-- ============================================================
-- Associar viaturas físicas aos grupos tarifários
-- + Enriquecer grupos single-veículo com marca_id/modelo_id
-- Idempotente: apenas preenche grupo_id=NULL; não sobrescreve
-- ============================================================

DO $$
DECLARE
  v_org_id uuid;

  -- Grupos
  g45  uuid; g50  uuid; g55  uuid; g65  uuid; g70  uuid;
  g80  uuid; g85  uuid; g90  uuid; g95  uuid; g100 uuid;
  g120 uuid; g125 uuid; g140 uuid; g150 uuid; g160 uuid;
  g175 uuid; g180 uuid; g300 uuid;

  -- Marcas (para enriquecer grupos)
  m_bmw      uuid; m_citroen  uuid; m_dacia   uuid; m_fiat     uuid;
  m_kia      uuid; m_mercedes uuid; m_nissan  uuid; m_opel     uuid;
  m_peugeot  uuid; m_porsche  uuid; m_renault uuid; m_seat     uuid;
  m_tesla    uuid; m_volvo    uuid;

  -- Modelos single-vehicle (para enriquecer grupos)
  mod_fiat_panda        uuid; mod_fiat_doblo       uuid;
  mod_vol_xc40          uuid; mod_mb_classe_a_250e uuid;
  mod_mb_glb            uuid; mod_mb_vito          uuid;
  mod_bmw_x4            uuid; mod_mb_vklasse       uuid;
  mod_por_718           uuid;

  c_viaturas int := 0;
  c_grupos   int := 0;
  v_rows     int;

BEGIN
  SELECT id INTO v_org_id FROM public.organizacoes ORDER BY created_at LIMIT 1;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Nenhuma organização encontrada'; END IF;

  -- ============================================================
  -- Carregar IDs dos grupos (criados pelo script anterior)
  -- ============================================================
  SELECT id INTO g45  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G45';
  SELECT id INTO g50  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G50';
  SELECT id INTO g55  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G55';
  SELECT id INTO g65  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G65';
  SELECT id INTO g70  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G70';
  SELECT id INTO g80  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G80';
  SELECT id INTO g85  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G85';
  SELECT id INTO g90  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G90';
  SELECT id INTO g95  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G95';
  SELECT id INTO g100 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G100';
  SELECT id INTO g120 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G120';
  SELECT id INTO g125 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G125';
  SELECT id INTO g140 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G140';
  SELECT id INTO g150 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G150';
  SELECT id INTO g160 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G160';
  SELECT id INTO g175 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G175';
  SELECT id INTO g180 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G180';
  SELECT id INTO g300 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G300';

  -- ============================================================
  -- Carregar marcas e modelos do catálogo
  -- ============================================================
  SELECT id INTO m_bmw      FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome))='bmw'           LIMIT 1;
  SELECT id INTO m_citroen  FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome)) LIKE '%citro%'  LIMIT 1;
  SELECT id INTO m_dacia    FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome))='dacia'         LIMIT 1;
  SELECT id INTO m_fiat     FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome))='fiat'          LIMIT 1;
  SELECT id INTO m_kia      FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome))='kia'           LIMIT 1;
  SELECT id INTO m_mercedes FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome)) LIKE '%mercedes%' LIMIT 1;
  SELECT id INTO m_nissan   FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome))='nissan'        LIMIT 1;
  SELECT id INTO m_opel     FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome))='opel'          LIMIT 1;
  SELECT id INTO m_peugeot  FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome))='peugeot'       LIMIT 1;
  SELECT id INTO m_porsche  FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome))='porsche'       LIMIT 1;
  SELECT id INTO m_renault  FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome))='renault'       LIMIT 1;
  SELECT id INTO m_seat     FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome))='seat'          LIMIT 1;
  SELECT id INTO m_tesla    FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome))='tesla'         LIMIT 1;
  SELECT id INTO m_volvo    FROM public.viatura_marcas WHERE org_id=v_org_id AND lower(trim(nome))='volvo'         LIMIT 1;

  SELECT id INTO mod_fiat_panda        FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_fiat     AND lower(trim(nome))='panda'         LIMIT 1;
  SELECT id INTO mod_fiat_doblo        FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_fiat     AND lower(trim(nome)) LIKE '%dobl%' AND lower(trim(nome)) NOT LIKE '%longa%' LIMIT 1;
  SELECT id INTO mod_vol_xc40          FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_volvo    AND lower(trim(nome))='xc40'          LIMIT 1;
  SELECT id INTO mod_mb_classe_a_250e  FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_mercedes AND lower(trim(nome)) LIKE '%250%'     LIMIT 1;
  SELECT id INTO mod_mb_glb            FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_mercedes AND lower(trim(nome))='glb'            LIMIT 1;
  SELECT id INTO mod_mb_vito           FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_mercedes AND lower(trim(nome))='vito'           LIMIT 1;
  SELECT id INTO mod_bmw_x4            FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_bmw     AND lower(trim(nome))='x4'              LIMIT 1;
  SELECT id INTO mod_mb_vklasse        FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_mercedes AND lower(trim(nome)) LIKE '%klasse%'   LIMIT 1;
  SELECT id INTO mod_por_718           FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_porsche  AND lower(trim(nome)) LIKE '%718%'      LIMIT 1;

  -- ============================================================
  -- PASSO 1: Enriquecer grupos single-veículo com marca/modelo
  -- (só preenche se ainda NULL — não sobrescreve escolhas manuais)
  -- ============================================================
  UPDATE public.renting_grupos SET marca_id=m_fiat,    modelo_id=mod_fiat_panda       WHERE id=g45  AND marca_id IS NULL; GET DIAGNOSTICS v_rows = ROW_COUNT; c_grupos:=c_grupos+v_rows;
  UPDATE public.renting_grupos SET marca_id=m_fiat,    modelo_id=mod_fiat_doblo       WHERE id=g50  AND marca_id IS NULL; GET DIAGNOSTICS v_rows = ROW_COUNT; c_grupos:=c_grupos+v_rows;
  UPDATE public.renting_grupos SET marca_id=m_volvo,   modelo_id=mod_vol_xc40         WHERE id=g100 AND marca_id IS NULL; GET DIAGNOSTICS v_rows = ROW_COUNT; c_grupos:=c_grupos+v_rows;
  UPDATE public.renting_grupos SET marca_id=m_mercedes,modelo_id=mod_mb_classe_a_250e WHERE id=g125 AND marca_id IS NULL; GET DIAGNOSTICS v_rows = ROW_COUNT; c_grupos:=c_grupos+v_rows;
  UPDATE public.renting_grupos SET marca_id=m_mercedes,modelo_id=mod_mb_glb           WHERE id=g150 AND marca_id IS NULL; GET DIAGNOSTICS v_rows = ROW_COUNT; c_grupos:=c_grupos+v_rows;
  UPDATE public.renting_grupos SET marca_id=m_mercedes,modelo_id=mod_mb_vito          WHERE id=g160 AND marca_id IS NULL; GET DIAGNOSTICS v_rows = ROW_COUNT; c_grupos:=c_grupos+v_rows;
  UPDATE public.renting_grupos SET marca_id=m_bmw,     modelo_id=mod_bmw_x4           WHERE id=g175 AND marca_id IS NULL; GET DIAGNOSTICS v_rows = ROW_COUNT; c_grupos:=c_grupos+v_rows;
  UPDATE public.renting_grupos SET marca_id=m_mercedes,modelo_id=mod_mb_vklasse       WHERE id=g180 AND marca_id IS NULL; GET DIAGNOSTICS v_rows = ROW_COUNT; c_grupos:=c_grupos+v_rows;
  UPDATE public.renting_grupos SET marca_id=m_porsche, modelo_id=mod_por_718          WHERE id=g300 AND marca_id IS NULL; GET DIAGNOSTICS v_rows = ROW_COUNT; c_grupos:=c_grupos+v_rows;

  -- ============================================================
  -- PASSO 2: Associar viaturas físicas a grupos
  -- Usa marca TEXT + modelo TEXT + combustivel TEXT (todos NOT NULL
  -- na tabela original). Só preenche grupo_id IS NULL.
  -- Para modelos com múltiplas versões (Astra, Corsa) usa combustivel.
  -- ============================================================

  -- BMW 116d/118d → G90
  UPDATE public.viaturas SET grupo_id=g90 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%bmw%'
    AND (lower(trim(modelo)) LIKE '%116%' OR lower(trim(modelo)) LIKE '%118%');
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- BMW 216d/218d → G95
  UPDATE public.viaturas SET grupo_id=g95 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%bmw%'
    AND (lower(trim(modelo)) LIKE '%216%' OR lower(trim(modelo)) LIKE '%218%');
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- BMW 530e → G120
  UPDATE public.viaturas SET grupo_id=g120 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%bmw%'
    AND lower(trim(modelo)) LIKE '%530%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- BMW X4 → G175
  UPDATE public.viaturas SET grupo_id=g175 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%bmw%'
    AND lower(trim(modelo)) LIKE '%x4%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Citroën C4 Diesel → G80
  UPDATE public.viaturas SET grupo_id=g80 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%citro%'
    AND lower(trim(modelo)) = 'c4'
    AND lower(coalesce(
          (SELECT nome FROM public.viatura_combustiveis WHERE id=combustivel_id),
          combustivel, ''
        )) LIKE '%diesel%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Citroën ë-C4 Elétrico → G90
  UPDATE public.viaturas SET grupo_id=g90 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%citro%'
    AND lower(trim(modelo)) LIKE '%c4%' AND lower(trim(modelo)) != 'c4';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Citroën Jumper → G90
  UPDATE public.viaturas SET grupo_id=g90 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%citro%'
    AND lower(trim(modelo)) LIKE '%jumper%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Dacia Jogger → G70
  UPDATE public.viaturas SET grupo_id=g70 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%dacia%'
    AND lower(trim(modelo)) LIKE '%jogger%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Fiat Ducato Contentor → G140
  UPDATE public.viaturas SET grupo_id=g140 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%fiat%'
    AND lower(trim(modelo)) LIKE '%ducato%cont%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Fiat Ducato Furgão → G90
  UPDATE public.viaturas SET grupo_id=g90 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%fiat%'
    AND lower(trim(modelo)) LIKE '%ducato%furg%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Fiat Doblò (não longa) → G50
  UPDATE public.viaturas SET grupo_id=g50 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%fiat%'
    AND lower(trim(modelo)) LIKE '%dobl%'
    AND lower(trim(modelo)) NOT LIKE '%longa%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Fiat Doblò Longa → G55
  UPDATE public.viaturas SET grupo_id=g55 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%fiat%'
    AND lower(trim(modelo)) LIKE '%dobl%longa%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Fiat Grande Panda → G80
  UPDATE public.viaturas SET grupo_id=g80 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%fiat%'
    AND lower(trim(modelo)) LIKE '%grande panda%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Fiat Panda (simples) → G45
  UPDATE public.viaturas SET grupo_id=g45 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%fiat%'
    AND lower(trim(modelo)) = 'panda';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Fiat Scudo → G70
  UPDATE public.viaturas SET grupo_id=g70 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%fiat%'
    AND lower(trim(modelo)) LIKE '%scudo%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Fiat Tipo → G65
  UPDATE public.viaturas SET grupo_id=g65 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%fiat%'
    AND lower(trim(modelo)) LIKE '%tipo%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Kia Ceed → G80
  UPDATE public.viaturas SET grupo_id=g80 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%kia%'
    AND lower(trim(modelo)) LIKE '%ceed%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Mercedes Classe A 180/200 → G90
  UPDATE public.viaturas SET grupo_id=g90 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%mercedes%'
    AND lower(trim(modelo)) LIKE '%classe a%'
    AND (lower(trim(modelo)) LIKE '%180%' OR lower(trim(modelo)) LIKE '%200%');
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Mercedes Classe A 250e → G125
  UPDATE public.viaturas SET grupo_id=g125 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%mercedes%'
    AND lower(trim(modelo)) LIKE '%classe a%'
    AND lower(trim(modelo)) LIKE '%250%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Mercedes Classe C 300de → G140
  UPDATE public.viaturas SET grupo_id=g140 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%mercedes%'
    AND lower(trim(modelo)) LIKE '%classe c%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Mercedes CLA → G120
  UPDATE public.viaturas SET grupo_id=g120 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%mercedes%'
    AND lower(trim(modelo)) LIKE '%cla%'
    AND lower(trim(modelo)) NOT LIKE '%classe%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Mercedes GLB → G150
  UPDATE public.viaturas SET grupo_id=g150 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%mercedes%'
    AND lower(trim(modelo)) LIKE '%glb%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Mercedes V-Klasse → G180
  UPDATE public.viaturas SET grupo_id=g180 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%mercedes%'
    AND lower(trim(modelo)) LIKE '%v%klasse%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Mercedes Vito → G160
  UPDATE public.viaturas SET grupo_id=g160 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%mercedes%'
    AND lower(trim(modelo)) LIKE '%vito%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Nissan Qashqai → G80
  UPDATE public.viaturas SET grupo_id=g80 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%nissan%'
    AND lower(trim(modelo)) LIKE '%qashqai%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Opel Astra Diesel → G85
  UPDATE public.viaturas SET grupo_id=g85 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%opel%'
    AND lower(trim(modelo)) LIKE '%astra%'
    AND lower(coalesce(
          (SELECT nome FROM public.viatura_combustiveis WHERE id=combustivel_id),
          combustivel, ''
        )) LIKE '%diesel%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Opel Astra Elétrico → G95
  UPDATE public.viaturas SET grupo_id=g95 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%opel%'
    AND lower(trim(modelo)) LIKE '%astra%'
    AND lower(coalesce(
          (SELECT nome FROM public.viatura_combustiveis WHERE id=combustivel_id),
          combustivel, ''
        )) LIKE '%el%trico%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Opel Astra Híbrido → G90
  UPDATE public.viaturas SET grupo_id=g90 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%opel%'
    AND lower(trim(modelo)) LIKE '%astra%'
    AND lower(coalesce(
          (SELECT nome FROM public.viatura_combustiveis WHERE id=combustivel_id),
          combustivel, ''
        )) LIKE '%h%brido%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Opel Corsa Diesel → G55
  UPDATE public.viaturas SET grupo_id=g55 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%opel%'
    AND lower(trim(modelo)) LIKE '%corsa%'
    AND lower(coalesce(
          (SELECT nome FROM public.viatura_combustiveis WHERE id=combustivel_id),
          combustivel, ''
        )) LIKE '%diesel%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Opel Corsa Elétrico → G65
  UPDATE public.viaturas SET grupo_id=g65 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%opel%'
    AND lower(trim(modelo)) LIKE '%corsa%'
    AND lower(coalesce(
          (SELECT nome FROM public.viatura_combustiveis WHERE id=combustivel_id),
          combustivel, ''
        )) LIKE '%el%trico%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Opel Grandland → G80
  UPDATE public.viaturas SET grupo_id=g80 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%opel%'
    AND lower(trim(modelo)) LIKE '%grandland%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Opel Mokka e → G90
  UPDATE public.viaturas SET grupo_id=g90 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%opel%'
    AND lower(trim(modelo)) LIKE '%mokka%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Opel Movano Van → G90 (deve vir ANTES de Movano genérico)
  UPDATE public.viaturas SET grupo_id=g90 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%opel%'
    AND lower(trim(modelo)) LIKE '%movano%van%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Opel Movano (caixa aberta, não van) → G120
  UPDATE public.viaturas SET grupo_id=g120 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%opel%'
    AND lower(trim(modelo)) LIKE '%movano%'
    AND lower(trim(modelo)) NOT LIKE '%van%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Opel Vivaro → G70
  UPDATE public.viaturas SET grupo_id=g70 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%opel%'
    AND lower(trim(modelo)) LIKE '%vivaro%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Peugeot 208 → G65
  UPDATE public.viaturas SET grupo_id=g65 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%peugeot%'
    AND lower(trim(modelo)) = '208';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Peugeot 308 → G85
  UPDATE public.viaturas SET grupo_id=g85 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%peugeot%'
    AND lower(trim(modelo)) = '308';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Peugeot 2008 → G90
  UPDATE public.viaturas SET grupo_id=g90 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%peugeot%'
    AND lower(trim(modelo)) = '2008';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Peugeot e-308 → G95
  UPDATE public.viaturas SET grupo_id=g95 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%peugeot%'
    AND lower(trim(modelo)) LIKE '%e%308%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Peugeot Boxer → G90
  UPDATE public.viaturas SET grupo_id=g90 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%peugeot%'
    AND lower(trim(modelo)) LIKE '%boxer%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Peugeot Expert → G70
  UPDATE public.viaturas SET grupo_id=g70 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%peugeot%'
    AND lower(trim(modelo)) LIKE '%expert%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Porsche 718 Cayman → G300
  UPDATE public.viaturas SET grupo_id=g300 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%porsche%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Renault Clio → G55
  UPDATE public.viaturas SET grupo_id=g55 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%renault%'
    AND lower(trim(modelo)) LIKE '%clio%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Renault Mégane → G80
  UPDATE public.viaturas SET grupo_id=g80 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%renault%'
    AND (lower(trim(modelo)) LIKE '%meg%ne%' OR lower(trim(modelo)) LIKE '%megane%');
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Renault Master Contentor → G140
  UPDATE public.viaturas SET grupo_id=g140 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%renault%'
    AND lower(trim(modelo)) LIKE '%master%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Seat Leon → G80
  UPDATE public.viaturas SET grupo_id=g80 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%seat%'
    AND lower(trim(modelo)) LIKE '%leon%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Tesla Model 3 → G140
  UPDATE public.viaturas SET grupo_id=g140 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%tesla%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- Volvo XC40 → G100
  UPDATE public.viaturas SET grupo_id=g100 WHERE org_id=v_org_id AND grupo_id IS NULL
    AND lower(trim(marca)) LIKE '%volvo%';
  GET DIAGNOSTICS v_rows = ROW_COUNT; c_viaturas:=c_viaturas+v_rows;

  -- ============================================================
  -- RELATÓRIO
  -- ============================================================
  RAISE NOTICE '======================================';
  RAISE NOTICE '  ASSOCIAÇÃO VIATURAS ↔ GRUPOS';
  RAISE NOTICE '--------------------------------------';
  RAISE NOTICE '  Grupos enriquecidos (marca/modelo): %', c_grupos;
  RAISE NOTICE '  Viaturas associadas a grupo:        %', c_viaturas;
  RAISE NOTICE '--------------------------------------';
  RAISE NOTICE '  Viaturas SEM grupo (verificar):';
  FOR v_rows IN
    SELECT count(*) FROM public.viaturas WHERE org_id=v_org_id AND grupo_id IS NULL
  LOOP END LOOP;
  RAISE NOTICE '  %', (SELECT count(*) FROM public.viaturas WHERE org_id=v_org_id AND grupo_id IS NULL);
  RAISE NOTICE '======================================';

END $$;
