-- ============================================================
-- Sincronizar Tabela de Preços DASP RENT → Base de Dados
-- Tabela válida até 31/12/2026
-- Idempotente: seguro executar múltiplas vezes
-- ============================================================

DO $$
DECLARE
  v_org_id uuid;

  -- Marcas
  m_bmw      uuid; m_citroen  uuid; m_dacia    uuid; m_fiat     uuid;
  m_kia      uuid; m_mercedes uuid; m_nissan   uuid; m_opel     uuid;
  m_peugeot  uuid; m_porsche  uuid; m_renault  uuid; m_seat     uuid;
  m_tesla    uuid; m_volvo    uuid;

  -- Modelos BMW
  mod_bmw_116_118 uuid; mod_bmw_216_218 uuid;
  mod_bmw_530e    uuid; mod_bmw_x4      uuid;
  -- Modelos Citroen
  mod_cit_c4 uuid; mod_cit_ec4 uuid; mod_cit_jumper uuid;
  -- Modelos Dacia
  mod_dac_jogger uuid;
  -- Modelos Fiat
  mod_fiat_ducato_cont  uuid; mod_fiat_ducato_furg uuid;
  mod_fiat_doblo        uuid; mod_fiat_doblo_longa uuid;
  mod_fiat_grande_panda uuid; mod_fiat_panda       uuid;
  mod_fiat_scudo        uuid; mod_fiat_tipo        uuid;
  -- Modelos Kia
  mod_kia_ceed uuid;
  -- Modelos Mercedes
  mod_mb_classe_a_180 uuid; mod_mb_classe_a_250e uuid;
  mod_mb_classe_c_300 uuid; mod_mb_cla           uuid;
  mod_mb_glb          uuid; mod_mb_vklasse       uuid;
  mod_mb_vito         uuid;
  -- Modelos Nissan
  mod_nis_qashqai uuid;
  -- Modelos Opel
  mod_opel_astra      uuid; mod_opel_corsa    uuid;
  mod_opel_grandland  uuid; mod_opel_mokka    uuid;
  mod_opel_movano     uuid; mod_opel_movano_van uuid;
  mod_opel_vivaro     uuid;
  -- Modelos Peugeot
  mod_peu_208 uuid; mod_peu_308  uuid; mod_peu_2008  uuid;
  mod_peu_e308 uuid; mod_peu_boxer uuid; mod_peu_expert uuid;
  -- Modelos Porsche
  mod_por_718 uuid;
  -- Modelos Renault
  mod_ren_clio uuid; mod_ren_megane uuid; mod_ren_master uuid;
  -- Modelos Seat/Tesla/Volvo
  mod_seat_leon uuid; mod_tes_model3 uuid; mod_vol_xc40 uuid;

  -- Versões (uma por linha da tabela)
  ver_bmw_116_diesel   uuid; ver_bmw_216_diesel   uuid;
  ver_bmw_530e_hibrido uuid; ver_bmw_x4_diesel    uuid;
  ver_cit_c4_diesel    uuid; ver_cit_ec4_eletrico  uuid;
  ver_cit_jumper       uuid; ver_dac_jogger        uuid;
  ver_fiat_duc_cont    uuid; ver_fiat_duc_furg     uuid;
  ver_fiat_doblo       uuid; ver_fiat_doblo_longa  uuid;
  ver_fiat_gd_panda    uuid; ver_fiat_panda        uuid;
  ver_fiat_scudo       uuid; ver_fiat_tipo         uuid;
  ver_kia_ceed         uuid;
  ver_mb_a180          uuid; ver_mb_a250e          uuid;
  ver_mb_c300          uuid; ver_mb_cla            uuid;
  ver_mb_glb           uuid; ver_mb_vklasse        uuid;
  ver_mb_vito          uuid;
  ver_nis_qashqai      uuid;
  ver_opel_astra_d     uuid; ver_opel_astra_e      uuid;
  ver_opel_astra_h     uuid; ver_opel_corsa_d      uuid;
  ver_opel_corsa_e     uuid; ver_opel_grandland    uuid;
  ver_opel_mokka       uuid; ver_opel_movano       uuid;
  ver_opel_movano_van  uuid; ver_opel_vivaro       uuid;
  ver_peu_208          uuid; ver_peu_308           uuid;
  ver_peu_2008         uuid; ver_peu_e308          uuid;
  ver_peu_boxer        uuid; ver_peu_expert        uuid;
  ver_por_718          uuid;
  ver_ren_clio         uuid; ver_ren_megane        uuid;
  ver_ren_master       uuid;
  ver_seat_leon        uuid; ver_tes_model3        uuid;
  ver_vol_xc40         uuid;

  -- Grupos (por diária)
  g45  uuid; g50  uuid; g55  uuid; g65  uuid; g70  uuid;
  g80  uuid; g85  uuid; g90  uuid; g95  uuid; g100 uuid;
  g120 uuid; g125 uuid; g140 uuid; g150 uuid; g160 uuid;
  g175 uuid; g180 uuid; g300 uuid;

  v_valido_ate date := '2026-12-31';

  c_marcas   int := 0; c_modelos  int := 0; c_versoes  int := 0;
  c_grupos_c int := 0; c_grupos_r int := 0;
  c_tarifas_c int := 0; c_tarifas_e int := 0;

BEGIN
  -- ============================================================
  -- 0. ORG_ID
  -- ============================================================
  SELECT id INTO v_org_id FROM public.organizacoes ORDER BY created_at LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma organização encontrada';
  END IF;
  RAISE NOTICE 'org_id: %', v_org_id;

  -- ============================================================
  -- 1. MARCAS (find-or-create)
  -- ============================================================

  SELECT id INTO m_bmw FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) = 'bmw' LIMIT 1;
  IF m_bmw IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'BMW') RETURNING id INTO m_bmw; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_citroen FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) IN ('citroen','citroën') LIMIT 1;
  IF m_citroen IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Citroën') RETURNING id INTO m_citroen; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_dacia FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) = 'dacia' LIMIT 1;
  IF m_dacia IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Dacia') RETURNING id INTO m_dacia; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_fiat FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) = 'fiat' LIMIT 1;
  IF m_fiat IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Fiat') RETURNING id INTO m_fiat; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_kia FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) = 'kia' LIMIT 1;
  IF m_kia IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Kia') RETURNING id INTO m_kia; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_mercedes FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) LIKE '%mercedes%' LIMIT 1;
  IF m_mercedes IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Mercedes-Benz') RETURNING id INTO m_mercedes; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_nissan FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) = 'nissan' LIMIT 1;
  IF m_nissan IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Nissan') RETURNING id INTO m_nissan; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_opel FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) = 'opel' LIMIT 1;
  IF m_opel IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Opel') RETURNING id INTO m_opel; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_peugeot FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) = 'peugeot' LIMIT 1;
  IF m_peugeot IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Peugeot') RETURNING id INTO m_peugeot; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_porsche FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) = 'porsche' LIMIT 1;
  IF m_porsche IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Porsche') RETURNING id INTO m_porsche; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_renault FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) = 'renault' LIMIT 1;
  IF m_renault IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Renault') RETURNING id INTO m_renault; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_seat FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) = 'seat' LIMIT 1;
  IF m_seat IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Seat') RETURNING id INTO m_seat; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_tesla FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) = 'tesla' LIMIT 1;
  IF m_tesla IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Tesla') RETURNING id INTO m_tesla; c_marcas:=c_marcas+1; END IF;

  SELECT id INTO m_volvo FROM public.viatura_marcas WHERE org_id = v_org_id AND lower(trim(nome)) = 'volvo' LIMIT 1;
  IF m_volvo IS NULL THEN INSERT INTO public.viatura_marcas(org_id,nome) VALUES(v_org_id,'Volvo') RETURNING id INTO m_volvo; c_marcas:=c_marcas+1; END IF;

  -- ============================================================
  -- 2. MODELOS (find-or-create)
  -- ============================================================

  -- BMW
  SELECT id INTO mod_bmw_116_118 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_bmw AND lower(trim(nome)) LIKE '%116%' LIMIT 1;
  IF mod_bmw_116_118 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_bmw,'116d / 118d') RETURNING id INTO mod_bmw_116_118; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_bmw_216_218 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_bmw AND lower(trim(nome)) LIKE '%216%' LIMIT 1;
  IF mod_bmw_216_218 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_bmw,'216d / 218d') RETURNING id INTO mod_bmw_216_218; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_bmw_530e FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_bmw AND lower(trim(nome)) LIKE '%530%' LIMIT 1;
  IF mod_bmw_530e IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_bmw,'530e') RETURNING id INTO mod_bmw_530e; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_bmw_x4 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_bmw AND lower(trim(nome)) = 'x4' LIMIT 1;
  IF mod_bmw_x4 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_bmw,'X4') RETURNING id INTO mod_bmw_x4; c_modelos:=c_modelos+1; END IF;

  -- Citroën
  SELECT id INTO mod_cit_c4 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_citroen AND lower(trim(nome)) = 'c4' LIMIT 1;
  IF mod_cit_c4 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_citroen,'C4') RETURNING id INTO mod_cit_c4; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_cit_ec4 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_citroen AND lower(trim(nome)) LIKE '%c4%' AND lower(trim(nome)) != 'c4' LIMIT 1;
  IF mod_cit_ec4 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_citroen,'ë-C4') RETURNING id INTO mod_cit_ec4; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_cit_jumper FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_citroen AND lower(trim(nome)) LIKE '%jumper%' LIMIT 1;
  IF mod_cit_jumper IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_citroen,'Jumper') RETURNING id INTO mod_cit_jumper; c_modelos:=c_modelos+1; END IF;

  -- Dacia
  SELECT id INTO mod_dac_jogger FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_dacia AND lower(trim(nome)) LIKE '%jogger%' LIMIT 1;
  IF mod_dac_jogger IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_dacia,'Jogger') RETURNING id INTO mod_dac_jogger; c_modelos:=c_modelos+1; END IF;

  -- Fiat
  SELECT id INTO mod_fiat_ducato_cont FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_fiat AND lower(trim(nome)) LIKE '%ducato%cont%' LIMIT 1;
  IF mod_fiat_ducato_cont IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_fiat,'Ducato Contentor') RETURNING id INTO mod_fiat_ducato_cont; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_fiat_ducato_furg FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_fiat AND lower(trim(nome)) LIKE '%ducato%furg%' LIMIT 1;
  IF mod_fiat_ducato_furg IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_fiat,'Ducato Furgão') RETURNING id INTO mod_fiat_ducato_furg; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_fiat_doblo FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_fiat AND lower(trim(nome)) LIKE '%dobl%' AND lower(trim(nome)) NOT LIKE '%longa%' LIMIT 1;
  IF mod_fiat_doblo IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_fiat,'Doblò') RETURNING id INTO mod_fiat_doblo; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_fiat_doblo_longa FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_fiat AND lower(trim(nome)) LIKE '%dobl%longa%' LIMIT 1;
  IF mod_fiat_doblo_longa IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_fiat,'Doblò Longa') RETURNING id INTO mod_fiat_doblo_longa; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_fiat_grande_panda FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_fiat AND lower(trim(nome)) LIKE '%grande panda%' LIMIT 1;
  IF mod_fiat_grande_panda IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_fiat,'Grande Panda') RETURNING id INTO mod_fiat_grande_panda; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_fiat_panda FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_fiat AND lower(trim(nome)) = 'panda' LIMIT 1;
  IF mod_fiat_panda IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_fiat,'Panda') RETURNING id INTO mod_fiat_panda; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_fiat_scudo FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_fiat AND lower(trim(nome)) LIKE '%scudo%' LIMIT 1;
  IF mod_fiat_scudo IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_fiat,'Scudo') RETURNING id INTO mod_fiat_scudo; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_fiat_tipo FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_fiat AND lower(trim(nome)) = 'tipo' LIMIT 1;
  IF mod_fiat_tipo IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_fiat,'Tipo') RETURNING id INTO mod_fiat_tipo; c_modelos:=c_modelos+1; END IF;

  -- Kia
  SELECT id INTO mod_kia_ceed FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_kia AND lower(trim(nome)) LIKE '%ceed%' LIMIT 1;
  IF mod_kia_ceed IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_kia,'Ceed') RETURNING id INTO mod_kia_ceed; c_modelos:=c_modelos+1; END IF;

  -- Mercedes-Benz
  SELECT id INTO mod_mb_classe_a_180 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_mercedes AND lower(trim(nome)) LIKE '%classe a%180%' LIMIT 1;
  IF mod_mb_classe_a_180 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_mercedes,'Classe A 180 / 200') RETURNING id INTO mod_mb_classe_a_180; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_mb_classe_a_250e FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_mercedes AND lower(trim(nome)) LIKE '%classe a%250%' LIMIT 1;
  IF mod_mb_classe_a_250e IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_mercedes,'Classe A 250e') RETURNING id INTO mod_mb_classe_a_250e; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_mb_classe_c_300 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_mercedes AND lower(trim(nome)) LIKE '%classe c%300%' LIMIT 1;
  IF mod_mb_classe_c_300 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_mercedes,'Classe C 300 de') RETURNING id INTO mod_mb_classe_c_300; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_mb_cla FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_mercedes AND lower(trim(nome)) = 'cla' LIMIT 1;
  IF mod_mb_cla IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_mercedes,'CLA') RETURNING id INTO mod_mb_cla; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_mb_glb FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_mercedes AND lower(trim(nome)) = 'glb' LIMIT 1;
  IF mod_mb_glb IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_mercedes,'GLB') RETURNING id INTO mod_mb_glb; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_mb_vklasse FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_mercedes AND lower(trim(nome)) LIKE '%v%klasse%' LIMIT 1;
  IF mod_mb_vklasse IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_mercedes,'V-Klasse') RETURNING id INTO mod_mb_vklasse; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_mb_vito FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_mercedes AND lower(trim(nome)) = 'vito' LIMIT 1;
  IF mod_mb_vito IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_mercedes,'Vito') RETURNING id INTO mod_mb_vito; c_modelos:=c_modelos+1; END IF;

  -- Nissan
  SELECT id INTO mod_nis_qashqai FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_nissan AND lower(trim(nome)) LIKE '%qashqai%' LIMIT 1;
  IF mod_nis_qashqai IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_nissan,'Qashqai') RETURNING id INTO mod_nis_qashqai; c_modelos:=c_modelos+1; END IF;

  -- Opel
  SELECT id INTO mod_opel_astra FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_opel AND lower(trim(nome)) = 'astra' LIMIT 1;
  IF mod_opel_astra IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_opel,'Astra') RETURNING id INTO mod_opel_astra; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_opel_corsa FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_opel AND lower(trim(nome)) = 'corsa' LIMIT 1;
  IF mod_opel_corsa IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_opel,'Corsa') RETURNING id INTO mod_opel_corsa; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_opel_grandland FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_opel AND lower(trim(nome)) LIKE '%grandland%' LIMIT 1;
  IF mod_opel_grandland IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_opel,'Grandland') RETURNING id INTO mod_opel_grandland; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_opel_mokka FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_opel AND lower(trim(nome)) LIKE '%mokka%' LIMIT 1;
  IF mod_opel_mokka IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_opel,'Mokka-e') RETURNING id INTO mod_opel_mokka; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_opel_movano FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_opel AND lower(trim(nome)) = 'movano' LIMIT 1;
  IF mod_opel_movano IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_opel,'Movano') RETURNING id INTO mod_opel_movano; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_opel_movano_van FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_opel AND lower(trim(nome)) LIKE '%movano%van%' LIMIT 1;
  IF mod_opel_movano_van IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_opel,'Movano Van') RETURNING id INTO mod_opel_movano_van; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_opel_vivaro FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_opel AND lower(trim(nome)) LIKE '%vivaro%' LIMIT 1;
  IF mod_opel_vivaro IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_opel,'Vivaro') RETURNING id INTO mod_opel_vivaro; c_modelos:=c_modelos+1; END IF;

  -- Peugeot
  SELECT id INTO mod_peu_208 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_peugeot AND lower(trim(nome)) = '208' LIMIT 1;
  IF mod_peu_208 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_peugeot,'208') RETURNING id INTO mod_peu_208; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_peu_308 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_peugeot AND lower(trim(nome)) = '308' LIMIT 1;
  IF mod_peu_308 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_peugeot,'308') RETURNING id INTO mod_peu_308; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_peu_2008 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_peugeot AND lower(trim(nome)) = '2008' LIMIT 1;
  IF mod_peu_2008 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_peugeot,'2008') RETURNING id INTO mod_peu_2008; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_peu_e308 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_peugeot AND lower(trim(nome)) LIKE '%e%308%' LIMIT 1;
  IF mod_peu_e308 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_peugeot,'e-308') RETURNING id INTO mod_peu_e308; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_peu_boxer FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_peugeot AND lower(trim(nome)) LIKE '%boxer%' LIMIT 1;
  IF mod_peu_boxer IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_peugeot,'Boxer') RETURNING id INTO mod_peu_boxer; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_peu_expert FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_peugeot AND lower(trim(nome)) LIKE '%expert%' LIMIT 1;
  IF mod_peu_expert IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_peugeot,'Expert') RETURNING id INTO mod_peu_expert; c_modelos:=c_modelos+1; END IF;

  -- Porsche
  SELECT id INTO mod_por_718 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_porsche AND lower(trim(nome)) LIKE '%718%' LIMIT 1;
  IF mod_por_718 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_porsche,'718 Cayman') RETURNING id INTO mod_por_718; c_modelos:=c_modelos+1; END IF;

  -- Renault
  SELECT id INTO mod_ren_clio FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_renault AND lower(trim(nome)) = 'clio' LIMIT 1;
  IF mod_ren_clio IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_renault,'Clio') RETURNING id INTO mod_ren_clio; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_ren_megane FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_renault AND lower(trim(nome)) LIKE '%g%ne%' LIMIT 1;
  IF mod_ren_megane IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_renault,'Mégane') RETURNING id INTO mod_ren_megane; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_ren_master FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_renault AND lower(trim(nome)) LIKE '%master%' LIMIT 1;
  IF mod_ren_master IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_renault,'Master Contentor') RETURNING id INTO mod_ren_master; c_modelos:=c_modelos+1; END IF;

  -- Seat / Tesla / Volvo
  SELECT id INTO mod_seat_leon FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_seat AND lower(trim(nome)) = 'leon' LIMIT 1;
  IF mod_seat_leon IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_seat,'Leon') RETURNING id INTO mod_seat_leon; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_tes_model3 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_tesla AND lower(trim(nome)) LIKE '%model%3%' LIMIT 1;
  IF mod_tes_model3 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_tesla,'Model 3') RETURNING id INTO mod_tes_model3; c_modelos:=c_modelos+1; END IF;

  SELECT id INTO mod_vol_xc40 FROM public.viatura_modelos WHERE org_id=v_org_id AND marca_id=m_volvo AND lower(trim(nome)) = 'xc40' LIMIT 1;
  IF mod_vol_xc40 IS NULL THEN INSERT INTO public.viatura_modelos(org_id,marca_id,nome) VALUES(v_org_id,m_volvo,'XC40') RETURNING id INTO mod_vol_xc40; c_modelos:=c_modelos+1; END IF;

  -- ============================================================
  -- 3. VERSÕES (uma por linha da tabela — find-or-create)
  -- ============================================================

  -- BMW 116d/118d — Diesel
  SELECT id INTO ver_bmw_116_diesel FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_bmw_116_118 AND lower(nome)='diesel' LIMIT 1;
  IF ver_bmw_116_diesel IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_bmw_116_118,'Diesel') RETURNING id INTO ver_bmw_116_diesel; c_versoes:=c_versoes+1; END IF;

  -- BMW 216d/218d — Diesel
  SELECT id INTO ver_bmw_216_diesel FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_bmw_216_218 AND lower(nome)='diesel' LIMIT 1;
  IF ver_bmw_216_diesel IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_bmw_216_218,'Diesel') RETURNING id INTO ver_bmw_216_diesel; c_versoes:=c_versoes+1; END IF;

  -- BMW 530e — Híbrido + Kit M
  SELECT id INTO ver_bmw_530e_hibrido FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_bmw_530e AND lower(nome) LIKE '%kit m%' LIMIT 1;
  IF ver_bmw_530e_hibrido IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_bmw_530e,'Híbrido + Kit M') RETURNING id INTO ver_bmw_530e_hibrido; c_versoes:=c_versoes+1; END IF;

  -- BMW X4 — Diesel
  SELECT id INTO ver_bmw_x4_diesel FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_bmw_x4 AND lower(nome)='diesel' LIMIT 1;
  IF ver_bmw_x4_diesel IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_bmw_x4,'Diesel') RETURNING id INTO ver_bmw_x4_diesel; c_versoes:=c_versoes+1; END IF;

  -- Citroën C4 — Diesel
  SELECT id INTO ver_cit_c4_diesel FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_cit_c4 AND lower(nome)='diesel' LIMIT 1;
  IF ver_cit_c4_diesel IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_cit_c4,'Diesel') RETURNING id INTO ver_cit_c4_diesel; c_versoes:=c_versoes+1; END IF;

  -- Citroën ë-C4 — Elétrico
  SELECT id INTO ver_cit_ec4_eletrico FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_cit_ec4 AND lower(nome) LIKE '%el%trico%' LIMIT 1;
  IF ver_cit_ec4_eletrico IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_cit_ec4,'Elétrico') RETURNING id INTO ver_cit_ec4_eletrico; c_versoes:=c_versoes+1; END IF;

  -- Citroën Jumper — Diesel + 17m³
  SELECT id INTO ver_cit_jumper FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_cit_jumper AND lower(nome) LIKE '%17%' LIMIT 1;
  IF ver_cit_jumper IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_cit_jumper,'Diesel + 17m³') RETURNING id INTO ver_cit_jumper; c_versoes:=c_versoes+1; END IF;

  -- Dacia Jogger — Bi-Fuel + 7 Lugares
  SELECT id INTO ver_dac_jogger FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_dac_jogger AND lower(nome) LIKE '%bi%fuel%' LIMIT 1;
  IF ver_dac_jogger IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_dac_jogger,'Bi-Fuel + 7 Lugares') RETURNING id INTO ver_dac_jogger; c_versoes:=c_versoes+1; END IF;

  -- Fiat Ducato Contentor — Diesel + 21m³
  SELECT id INTO ver_fiat_duc_cont FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_fiat_ducato_cont AND lower(nome) LIKE '%21%' LIMIT 1;
  IF ver_fiat_duc_cont IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_fiat_ducato_cont,'Diesel + 21m³') RETURNING id INTO ver_fiat_duc_cont; c_versoes:=c_versoes+1; END IF;

  -- Fiat Ducato Furgão — Diesel + 13/15m³
  SELECT id INTO ver_fiat_duc_furg FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_fiat_ducato_furg AND lower(nome) LIKE '%13%' LIMIT 1;
  IF ver_fiat_duc_furg IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_fiat_ducato_furg,'Diesel + 13/15m³') RETURNING id INTO ver_fiat_duc_furg; c_versoes:=c_versoes+1; END IF;

  -- Fiat Doblò — Diesel + 5m³
  SELECT id INTO ver_fiat_doblo FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_fiat_doblo AND lower(nome) LIKE '%5%' LIMIT 1;
  IF ver_fiat_doblo IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_fiat_doblo,'Diesel + 5m³') RETURNING id INTO ver_fiat_doblo; c_versoes:=c_versoes+1; END IF;

  -- Fiat Doblò Longa — Diesel
  SELECT id INTO ver_fiat_doblo_longa FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_fiat_doblo_longa AND lower(nome)='diesel' LIMIT 1;
  IF ver_fiat_doblo_longa IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_fiat_doblo_longa,'Diesel') RETURNING id INTO ver_fiat_doblo_longa; c_versoes:=c_versoes+1; END IF;

  -- Fiat Grande Panda — Elétrico
  SELECT id INTO ver_fiat_gd_panda FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_fiat_grande_panda AND lower(nome) LIKE '%el%trico%' LIMIT 1;
  IF ver_fiat_gd_panda IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_fiat_grande_panda,'Elétrico') RETURNING id INTO ver_fiat_gd_panda; c_versoes:=c_versoes+1; END IF;

  -- Fiat Panda — Diesel / Híbrido / Bi-Fuel
  SELECT id INTO ver_fiat_panda FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_fiat_panda AND lower(nome) LIKE '%diesel%h%brido%' LIMIT 1;
  IF ver_fiat_panda IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_fiat_panda,'Diesel / Híbrido / Bi-Fuel') RETURNING id INTO ver_fiat_panda; c_versoes:=c_versoes+1; END IF;

  -- Fiat Scudo — Diesel + 7m³
  SELECT id INTO ver_fiat_scudo FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_fiat_scudo AND lower(nome) LIKE '%7%' LIMIT 1;
  IF ver_fiat_scudo IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_fiat_scudo,'Diesel + 7m³') RETURNING id INTO ver_fiat_scudo; c_versoes:=c_versoes+1; END IF;

  -- Fiat Tipo — Diesel
  SELECT id INTO ver_fiat_tipo FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_fiat_tipo AND lower(nome)='diesel' LIMIT 1;
  IF ver_fiat_tipo IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_fiat_tipo,'Diesel') RETURNING id INTO ver_fiat_tipo; c_versoes:=c_versoes+1; END IF;

  -- Kia Ceed — Diesel PHEV
  SELECT id INTO ver_kia_ceed FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_kia_ceed AND lower(nome) LIKE '%phev%' LIMIT 1;
  IF ver_kia_ceed IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_kia_ceed,'Diesel PHEV') RETURNING id INTO ver_kia_ceed; c_versoes:=c_versoes+1; END IF;

  -- Mercedes Classe A 180/200 — Diesel / Gasolina
  SELECT id INTO ver_mb_a180 FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_mb_classe_a_180 AND lower(nome) LIKE '%gasolina%' LIMIT 1;
  IF ver_mb_a180 IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_mb_classe_a_180,'Diesel / Gasolina') RETURNING id INTO ver_mb_a180; c_versoes:=c_versoes+1; END IF;

  -- Mercedes Classe A 250e — Híbrido + Kit AMG
  SELECT id INTO ver_mb_a250e FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_mb_classe_a_250e AND lower(nome) LIKE '%amg%' LIMIT 1;
  IF ver_mb_a250e IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_mb_classe_a_250e,'Híbrido + Kit AMG') RETURNING id INTO ver_mb_a250e; c_versoes:=c_versoes+1; END IF;

  -- Mercedes Classe C 300 de — Híbrido (Diesel)
  SELECT id INTO ver_mb_c300 FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_mb_classe_c_300 AND lower(nome) LIKE '%h%brido%diesel%' LIMIT 1;
  IF ver_mb_c300 IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_mb_classe_c_300,'Híbrido (Diesel)') RETURNING id INTO ver_mb_c300; c_versoes:=c_versoes+1; END IF;

  -- Mercedes CLA — Diesel
  SELECT id INTO ver_mb_cla FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_mb_cla AND lower(nome)='diesel' LIMIT 1;
  IF ver_mb_cla IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_mb_cla,'Diesel') RETURNING id INTO ver_mb_cla; c_versoes:=c_versoes+1; END IF;

  -- Mercedes GLB — Diesel
  SELECT id INTO ver_mb_glb FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_mb_glb AND lower(nome)='diesel' LIMIT 1;
  IF ver_mb_glb IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_mb_glb,'Diesel') RETURNING id INTO ver_mb_glb; c_versoes:=c_versoes+1; END IF;

  -- Mercedes V-Klasse — Diesel + 8 Lugares
  SELECT id INTO ver_mb_vklasse FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_mb_vklasse AND lower(nome) LIKE '%8%' LIMIT 1;
  IF ver_mb_vklasse IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_mb_vklasse,'Diesel + 8 Lugares') RETURNING id INTO ver_mb_vklasse; c_versoes:=c_versoes+1; END IF;

  -- Mercedes Vito — Diesel + 9 Lugares
  SELECT id INTO ver_mb_vito FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_mb_vito AND lower(nome) LIKE '%9%' LIMIT 1;
  IF ver_mb_vito IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_mb_vito,'Diesel + 9 Lugares') RETURNING id INTO ver_mb_vito; c_versoes:=c_versoes+1; END IF;

  -- Nissan Qashqai — Gasolina
  SELECT id INTO ver_nis_qashqai FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_nis_qashqai AND lower(nome)='gasolina' LIMIT 1;
  IF ver_nis_qashqai IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_nis_qashqai,'Gasolina') RETURNING id INTO ver_nis_qashqai; c_versoes:=c_versoes+1; END IF;

  -- Opel Astra — Diesel
  SELECT id INTO ver_opel_astra_d FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_opel_astra AND lower(nome)='diesel' LIMIT 1;
  IF ver_opel_astra_d IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_opel_astra,'Diesel') RETURNING id INTO ver_opel_astra_d; c_versoes:=c_versoes+1; END IF;

  -- Opel Astra — Elétrico
  SELECT id INTO ver_opel_astra_e FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_opel_astra AND lower(nome) LIKE '%el%trico%' LIMIT 1;
  IF ver_opel_astra_e IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_opel_astra,'Elétrico') RETURNING id INTO ver_opel_astra_e; c_versoes:=c_versoes+1; END IF;

  -- Opel Astra — Híbrido
  SELECT id INTO ver_opel_astra_h FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_opel_astra AND lower(nome) LIKE '%h%brido%' LIMIT 1;
  IF ver_opel_astra_h IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_opel_astra,'Híbrido') RETURNING id INTO ver_opel_astra_h; c_versoes:=c_versoes+1; END IF;

  -- Opel Corsa — Diesel
  SELECT id INTO ver_opel_corsa_d FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_opel_corsa AND lower(nome)='diesel' LIMIT 1;
  IF ver_opel_corsa_d IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_opel_corsa,'Diesel') RETURNING id INTO ver_opel_corsa_d; c_versoes:=c_versoes+1; END IF;

  -- Opel Corsa — Elétrico
  SELECT id INTO ver_opel_corsa_e FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_opel_corsa AND lower(nome) LIKE '%el%trico%' LIMIT 1;
  IF ver_opel_corsa_e IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_opel_corsa,'Elétrico') RETURNING id INTO ver_opel_corsa_e; c_versoes:=c_versoes+1; END IF;

  -- Opel Grandland — Híbrido
  SELECT id INTO ver_opel_grandland FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_opel_grandland AND lower(nome) LIKE '%h%brido%' LIMIT 1;
  IF ver_opel_grandland IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_opel_grandland,'Híbrido') RETURNING id INTO ver_opel_grandland; c_versoes:=c_versoes+1; END IF;

  -- Opel Mokka-e — Elétrico
  SELECT id INTO ver_opel_mokka FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_opel_mokka AND lower(nome) LIKE '%el%trico%' LIMIT 1;
  IF ver_opel_mokka IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_opel_mokka,'Elétrico') RETURNING id INTO ver_opel_mokka; c_versoes:=c_versoes+1; END IF;

  -- Opel Movano — Diesel + Caixa Aberta
  SELECT id INTO ver_opel_movano FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_opel_movano AND lower(nome) LIKE '%caixa%' LIMIT 1;
  IF ver_opel_movano IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_opel_movano,'Diesel + Caixa Aberta') RETURNING id INTO ver_opel_movano; c_versoes:=c_versoes+1; END IF;

  -- Opel Movano Van — Diesel + 15m³
  SELECT id INTO ver_opel_movano_van FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_opel_movano_van AND lower(nome) LIKE '%15%' LIMIT 1;
  IF ver_opel_movano_van IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_opel_movano_van,'Diesel + 15m³') RETURNING id INTO ver_opel_movano_van; c_versoes:=c_versoes+1; END IF;

  -- Opel Vivaro — Diesel + 7m³
  SELECT id INTO ver_opel_vivaro FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_opel_vivaro AND lower(nome) LIKE '%7%' LIMIT 1;
  IF ver_opel_vivaro IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_opel_vivaro,'Diesel + 7m³') RETURNING id INTO ver_opel_vivaro; c_versoes:=c_versoes+1; END IF;

  -- Peugeot 208 — Gasolina
  SELECT id INTO ver_peu_208 FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_peu_208 AND lower(nome)='gasolina' LIMIT 1;
  IF ver_peu_208 IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_peu_208,'Gasolina') RETURNING id INTO ver_peu_208; c_versoes:=c_versoes+1; END IF;

  -- Peugeot 308 — Diesel
  SELECT id INTO ver_peu_308 FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_peu_308 AND lower(nome)='diesel' LIMIT 1;
  IF ver_peu_308 IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_peu_308,'Diesel') RETURNING id INTO ver_peu_308; c_versoes:=c_versoes+1; END IF;

  -- Peugeot 2008 — Diesel
  SELECT id INTO ver_peu_2008 FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_peu_2008 AND lower(nome)='diesel' LIMIT 1;
  IF ver_peu_2008 IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_peu_2008,'Diesel') RETURNING id INTO ver_peu_2008; c_versoes:=c_versoes+1; END IF;

  -- Peugeot e-308 — Elétrico
  SELECT id INTO ver_peu_e308 FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_peu_e308 AND lower(nome) LIKE '%el%trico%' LIMIT 1;
  IF ver_peu_e308 IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_peu_e308,'Elétrico') RETURNING id INTO ver_peu_e308; c_versoes:=c_versoes+1; END IF;

  -- Peugeot Boxer — Diesel + 15m³
  SELECT id INTO ver_peu_boxer FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_peu_boxer AND lower(nome) LIKE '%15%' LIMIT 1;
  IF ver_peu_boxer IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_peu_boxer,'Diesel + 15m³') RETURNING id INTO ver_peu_boxer; c_versoes:=c_versoes+1; END IF;

  -- Peugeot Expert — Diesel + 7m³
  SELECT id INTO ver_peu_expert FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_peu_expert AND lower(nome) LIKE '%7%' LIMIT 1;
  IF ver_peu_expert IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_peu_expert,'Diesel + 7m³') RETURNING id INTO ver_peu_expert; c_versoes:=c_versoes+1; END IF;

  -- Porsche 718 Cayman — Gasolina
  SELECT id INTO ver_por_718 FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_por_718 AND lower(nome)='gasolina' LIMIT 1;
  IF ver_por_718 IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_por_718,'Gasolina') RETURNING id INTO ver_por_718; c_versoes:=c_versoes+1; END IF;

  -- Renault Clio — Diesel dCi
  SELECT id INTO ver_ren_clio FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_ren_clio AND lower(nome) LIKE '%dci%' LIMIT 1;
  IF ver_ren_clio IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_ren_clio,'Diesel dCi') RETURNING id INTO ver_ren_clio; c_versoes:=c_versoes+1; END IF;

  -- Renault Mégane — Diesel dCi
  SELECT id INTO ver_ren_megane FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_ren_megane AND lower(nome) LIKE '%dci%' LIMIT 1;
  IF ver_ren_megane IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_ren_megane,'Diesel dCi') RETURNING id INTO ver_ren_megane; c_versoes:=c_versoes+1; END IF;

  -- Renault Master Contentor — Diesel + 21m³
  SELECT id INTO ver_ren_master FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_ren_master AND lower(nome) LIKE '%21%' LIMIT 1;
  IF ver_ren_master IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_ren_master,'Diesel + 21m³') RETURNING id INTO ver_ren_master; c_versoes:=c_versoes+1; END IF;

  -- Seat Leon — Diesel
  SELECT id INTO ver_seat_leon FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_seat_leon AND lower(nome)='diesel' LIMIT 1;
  IF ver_seat_leon IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_seat_leon,'Diesel') RETURNING id INTO ver_seat_leon; c_versoes:=c_versoes+1; END IF;

  -- Tesla Model 3 — Elétrico
  SELECT id INTO ver_tes_model3 FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_tes_model3 AND lower(nome) LIKE '%el%trico%' LIMIT 1;
  IF ver_tes_model3 IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_tes_model3,'Elétrico') RETURNING id INTO ver_tes_model3; c_versoes:=c_versoes+1; END IF;

  -- Volvo XC40 — Gasolina
  SELECT id INTO ver_vol_xc40 FROM public.viatura_versoes WHERE org_id=v_org_id AND modelo_id=mod_vol_xc40 AND lower(nome)='gasolina' LIMIT 1;
  IF ver_vol_xc40 IS NULL THEN INSERT INTO public.viatura_versoes(org_id,modelo_id,nome) VALUES(v_org_id,mod_vol_xc40,'Gasolina') RETURNING id INTO ver_vol_xc40; c_versoes:=c_versoes+1; END IF;

  -- ============================================================
  -- 4. GRUPOS TARIFÁRIOS (um por valor único de diária)
  -- ============================================================

  SELECT id INTO g45  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G45';
  IF g45  IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 45€/dia','G45','Fiat Panda') RETURNING id INTO g45;  c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g50  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G50';
  IF g50  IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 50€/dia','G50','Fiat Doblò') RETURNING id INTO g50;  c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g55  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G55';
  IF g55  IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 55€/dia','G55','Fiat Doblò Longa · Opel Corsa Diesel · Renault Clio') RETURNING id INTO g55;  c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g65  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G65';
  IF g65  IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 65€/dia','G65','Fiat Tipo · Opel Corsa Elétrico · Peugeot 208') RETURNING id INTO g65;  c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g70  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G70';
  IF g70  IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 70€/dia','G70','Dacia Jogger · Fiat Scudo · Opel Vivaro · Peugeot Expert') RETURNING id INTO g70;  c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g80  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G80';
  IF g80  IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 80€/dia','G80','Citroën C4 · Fiat Grande Panda · Kia Ceed · Nissan Qashqai · Opel Grandland · Renault Mégane · Seat Leon') RETURNING id INTO g80;  c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g85  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G85';
  IF g85  IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 85€/dia','G85','Opel Astra Diesel · Peugeot 308') RETURNING id INTO g85;  c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g90  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G90';
  IF g90  IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 90€/dia','G90','BMW 116d/118d · Citroën ë-C4 · Citroën Jumper · Fiat Ducato Furgão · MB Classe A 180/200 · Opel Astra Híbrido · Opel Mokka-e · Opel Movano Van · Peugeot 2008 · Peugeot Boxer') RETURNING id INTO g90;  c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g95  FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G95';
  IF g95  IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 95€/dia','G95','BMW 216d/218d · Opel Astra Elétrico · Peugeot e-308') RETURNING id INTO g95;  c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g100 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G100';
  IF g100 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 100€/dia','G100','Volvo XC40') RETURNING id INTO g100; c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g120 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G120';
  IF g120 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 120€/dia','G120','BMW 530e · Mercedes CLA · Opel Movano') RETURNING id INTO g120; c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g125 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G125';
  IF g125 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 125€/dia','G125','Mercedes Classe A 250e') RETURNING id INTO g125; c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g140 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G140';
  IF g140 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 140€/dia','G140','Fiat Ducato Contentor · MB Classe C 300de · Renault Master Contentor · Tesla Model 3') RETURNING id INTO g140; c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g150 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G150';
  IF g150 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 150€/dia','G150','Mercedes GLB') RETURNING id INTO g150; c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g160 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G160';
  IF g160 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 160€/dia','G160','Mercedes Vito') RETURNING id INTO g160; c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g175 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G175';
  IF g175 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 175€/dia','G175','BMW X4') RETURNING id INTO g175; c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g180 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G180';
  IF g180 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 180€/dia','G180','Mercedes V-Klasse') RETURNING id INTO g180; c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  SELECT id INTO g300 FROM public.renting_grupos WHERE org_id=v_org_id AND codigo='G300';
  IF g300 IS NULL THEN INSERT INTO public.renting_grupos(org_id,nome,codigo,descricao) VALUES(v_org_id,'Grupo 300€/dia','G300','Porsche 718 Cayman') RETURNING id INTO g300; c_grupos_c:=c_grupos_c+1; ELSE c_grupos_r:=c_grupos_r+1; END IF;

  -- ============================================================
  -- 5. TARIFAS (uma por veículo — find-or-create)
  --    preco_dia, preco_mes, km_adicional_valor, valido_ate
  -- ============================================================

  -- G45
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g45 AND lower(nome) LIKE '%panda%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g45,'Fiat Panda - Diesel/Híbrido/Bi-Fuel',45.00,525.00,0.19,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G50
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g50 AND lower(nome) LIKE '%dobl%' AND lower(nome) NOT LIKE '%longa%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g50,'Fiat Doblò - Diesel + 5m³',50.00,525.00,0.19,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G55
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g55 AND lower(nome) LIKE '%dobl%longa%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g55,'Fiat Doblò Longa - Diesel',55.00,575.00,0.19,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g55 AND lower(nome) LIKE '%corsa%diesel%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g55,'Opel Corsa - Diesel',55.00,625.00,0.20,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g55 AND lower(nome) LIKE '%clio%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g55,'Renault Clio - Diesel dCi',55.00,475.00,0.20,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G65
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g65 AND lower(nome) LIKE '%tipo%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g65,'Fiat Tipo - Diesel',65.00,650.00,0.20,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g65 AND lower(nome) LIKE '%corsa%el%trico%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g65,'Opel Corsa - Elétrico',65.00,725.00,0.22,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g65 AND lower(nome) LIKE '%208%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g65,'Peugeot 208 - Gasolina',65.00,650.00,0.20,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G70
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g70 AND lower(nome) LIKE '%jogger%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g70,'Dacia Jogger - Bi-Fuel + 7 Lugares',70.00,800.00,0.20,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g70 AND lower(nome) LIKE '%scudo%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g70,'Fiat Scudo - Diesel + 7m³',70.00,680.00,0.21,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g70 AND lower(nome) LIKE '%vivaro%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g70,'Opel Vivaro - Diesel + 7m³',70.00,680.00,0.21,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g70 AND lower(nome) LIKE '%expert%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g70,'Peugeot Expert - Diesel + 7m³',70.00,680.00,0.21,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G80
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%c4%diesel%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g80,'Citroën C4 - Diesel',80.00,850.00,0.20,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%grande panda%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g80,'Fiat Grande Panda - Elétrico',80.00,900.00,0.22,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%ceed%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g80,'Kia Ceed - Diesel PHEV',80.00,800.00,0.21,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%qashqai%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g80,'Nissan Qashqai - Gasolina',80.00,800.00,0.20,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%grandland%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g80,'Opel Grandland - Híbrido',80.00,800.00,0.22,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%g%ne%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g80,'Renault Mégane - Diesel dCi',80.00,800.00,0.20,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g80 AND lower(nome) LIKE '%leon%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g80,'Seat Leon - Diesel',80.00,850.00,0.20,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G85
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g85 AND lower(nome) LIKE '%astra%diesel%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g85,'Opel Astra - Diesel',85.00,850.00,0.20,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g85 AND lower(nome) LIKE '%308%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g85,'Peugeot 308 - Diesel',85.00,850.00,0.20,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G90
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%116%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g90,'BMW 116d/118d - Diesel',90.00,900.00,0.21,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%c4%el%trico%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g90,'Citroën ë-C4 - Elétrico',90.00,950.00,0.22,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%jumper%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g90,'Citroën Jumper - Diesel + 17m³',90.00,1100.00,0.23,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%ducato furg%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g90,'Fiat Ducato Furgão - Diesel + 13/15m³',90.00,1100.00,0.23,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%classe a%180%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g90,'Mercedes Classe A 180/200 - Diesel/Gasolina',90.00,950.00,0.22,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%astra%h%brido%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g90,'Opel Astra - Híbrido',90.00,900.00,0.22,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%mokka%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g90,'Opel Mokka-e - Elétrico',90.00,900.00,0.22,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%movano van%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g90,'Opel Movano Van - Diesel + 15m³',90.00,1100.00,0.23,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%2008%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g90,'Peugeot 2008 - Diesel',90.00,900.00,0.20,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g90 AND lower(nome) LIKE '%boxer%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g90,'Peugeot Boxer - Diesel + 15m³',90.00,1100.00,0.23,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G95
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g95 AND lower(nome) LIKE '%216%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g95,'BMW 216d/218d - Diesel',95.00,1000.00,0.23,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g95 AND lower(nome) LIKE '%astra%el%trico%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g95,'Opel Astra - Elétrico',95.00,950.00,0.22,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g95 AND lower(nome) LIKE '%e%308%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g95,'Peugeot e-308 - Elétrico',95.00,950.00,0.35,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G100
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g100 AND lower(nome) LIKE '%xc40%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g100,'Volvo XC40 - Gasolina',100.00,1100.00,0.25,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G120
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g120 AND lower(nome) LIKE '%530%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g120,'BMW 530e - Híbrido + Kit M',120.00,1400.00,0.36,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g120 AND lower(nome) LIKE '%cla%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g120,'Mercedes CLA - Diesel',120.00,1200.00,0.22,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g120 AND lower(nome) LIKE '%movano%caixa%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g120,'Opel Movano - Diesel + Caixa Aberta',120.00,1250.00,0.26,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G125
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g125 AND lower(nome) LIKE '%250e%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g125,'Mercedes Classe A 250e - Híbrido + Kit AMG',125.00,1000.00,0.22,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G140
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g140 AND lower(nome) LIKE '%ducato cont%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g140,'Fiat Ducato Contentor - Diesel + 21m³',140.00,1400.00,0.26,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g140 AND lower(nome) LIKE '%300%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g140,'Mercedes Classe C 300 de - Híbrido (Diesel)',140.00,1300.00,0.29,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g140 AND lower(nome) LIKE '%master%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g140,'Renault Master Contentor - Diesel + 21m³',140.00,1400.00,0.26,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g140 AND lower(nome) LIKE '%model 3%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g140,'Tesla Model 3 - Elétrico',140.00,1400.00,0.35,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G150
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g150 AND lower(nome) LIKE '%glb%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g150,'Mercedes GLB - Diesel',150.00,1200.00,0.25,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G160
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g160 AND lower(nome) LIKE '%vito%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g160,'Mercedes Vito - Diesel + 9 Lugares',160.00,1700.00,0.31,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G175
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g175 AND lower(nome) LIKE '%x4%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g175,'BMW X4 - Diesel',175.00,3000.00,0.36,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G180
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g180 AND lower(nome) LIKE '%v%klasse%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g180,'Mercedes V-Klasse - Diesel + 8 Lugares',180.00,1800.00,0.31,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- G300
  IF NOT EXISTS(SELECT 1 FROM public.renting_tarifas WHERE org_id=v_org_id AND grupo_id=g300 AND lower(nome) LIKE '%cayman%') THEN
    INSERT INTO public.renting_tarifas(org_id,grupo_id,nome,preco_dia,preco_mes,km_adicional_valor,tipo,valido_ate) VALUES(v_org_id,g300,'Porsche 718 Cayman - Gasolina',300.00,3000.00,0.36,'renting',v_valido_ate); c_tarifas_c:=c_tarifas_c+1;
  ELSE c_tarifas_e:=c_tarifas_e+1; END IF;

  -- ============================================================
  -- RELATÓRIO FINAL
  -- ============================================================
  RAISE NOTICE '======================================';
  RAISE NOTICE '  SINCRONIZAÇÃO TABELA DE PREÇOS';
  RAISE NOTICE '--------------------------------------';
  RAISE NOTICE '  Marcas criadas        : %', c_marcas;
  RAISE NOTICE '  Modelos criados       : %', c_modelos;
  RAISE NOTICE '  Versões criadas       : %', c_versoes;
  RAISE NOTICE '  Grupos criados        : %', c_grupos_c;
  RAISE NOTICE '  Grupos reutilizados   : %', c_grupos_r;
  RAISE NOTICE '  Tarifas criadas       : %', c_tarifas_c;
  RAISE NOTICE '  Tarifas já existentes : %', c_tarifas_e;
  RAISE NOTICE '======================================';

END $$;
