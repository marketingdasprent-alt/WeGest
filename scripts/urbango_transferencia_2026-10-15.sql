-- Transferência de 31 carrinhas da Década Ousada para a org URBAN GO (2026-10-15).
--
-- Pedido do Thiago: as carrinhas, os clientes e os contratos vivos (com todas as versões,
-- mesmo número e mesmas datas) passam a existir na URBAN GO. Cobranças, conta corrente e
-- notas de crédito desses contratos MUDAM de org (não se duplicam). As faturas já emitidas
-- pela Dasp Rent Sul ficam na Década. Na Década os contratos vivos fecham (o agendado cancela)
-- e as viaturas ficam inativas.
--
-- v_ensaio = true  → faz tudo e rola para trás; o relatório sai na excepção.
-- v_ensaio = false → aplica. A tabela public.zz_transferencia_urbango_20261015 guarda o mapa
--                    id antigo → id novo e os valores antigos do que foi movido (para desfazer).
--
-- Fase A corre com os triggers de utilizador desligados nas tabelas tocadas: nada de eventos
-- de calendário, domain_events, notificações, débitos de danos, nem a protecção de cobranças
-- emitidas (que proíbe mudar o destinatário). Fase B (Década) corre com os triggers ligados,
-- para a cascata normal de fecho (reserva concluída, histórico).

DO $$
DECLARE
  v_ensaio          boolean := true;
  v_decada          uuid := '11111111-1111-1111-1111-111111111111';
  v_urbango         uuid := 'd1a64e1b-47ef-4e5f-8acd-516a2f9f5e28';
  v_emissora_urb    uuid := '6a572ae5-323b-4b46-9b29-f8c35684e742'; -- Urbango, Lda (org URBAN GO)
  v_emissora_dec    uuid := '21dde9b4-f0fb-49ac-b403-d4b48a1fd7ba'; -- Urbango, Lda (org Década): contactos
  v_template_fonte  uuid := 'e120c0cb-ac8e-4b67-af6f-9867b54f5cc2'; -- Contrato Aluguer (Urbango, org Década)
  v_template_curto  uuid := 'c625b37d-6b09-4323-aceb-a24ed27116fe'; -- Contrato Aluguer curto (org URBAN GO)
  v_thiago          uuid := 'd33582b8-2bf8-4fbc-814c-53a56d5db416'; -- thiago.sousa@dasprent.pt
  v_ivone           uuid := '5968bbeb-6fe6-4712-a2a8-5cada184b00e';
  v_cargo_admin_urb uuid := 'cce6de9d-c9ba-40d2-b259-63531173a50a';
  v_cargo_fat_dec   uuid := 'd7027937-c5cb-43f6-8640-e99e67f02c18';
  v_cargo_fat_urb   uuid;
  v_template_novo   uuid;
  v_matriculas      text[] := array[
    'BO-47-ZC','BP-52-GJ','BQ-77-FN',
    'BO-74-HR','BJ-33-GJ','BO-03-HS','BP-27-JT','BJ-55-GJ','BJ-10-GN','BJ-85-GL','BJ-96-GM',
    'BO-00-HS','BO-01-XB','BO-82-HR','BO-95-HR','BO-87-HR','BO-96-HR','BS-12-OJ',
    'BS-13-NI','BS-31-NH','BO-37-EH',
    'BJ-68-GI','BJ-73-GJ','BJ-33-GM','BJ-39-GL',
    'BO-84-GD',
    'BL-43-GL','BL-87-RS','BL-32-RS',
    'BN-45-IO','BO-27-BD'];
  v_rel  text := '';
  v_n    int;
  v_n2   int;
  v_t    text;
  rec    record;
BEGIN
  PERFORM set_config('lock_timeout', '8s', true);

  -- ── 0. Pré-condições ──────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.viaturas WHERE org_id = v_decada AND matricula = ANY(v_matriculas);
  IF v_n <> array_length(v_matriculas, 1) THEN
    RAISE EXCEPTION 'Esperava % matrículas na Década, encontrei %.', array_length(v_matriculas, 1), v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.viaturas WHERE org_id = v_urbango AND matricula = ANY(v_matriculas);
  IF v_n > 0 THEN RAISE EXCEPTION 'Já há % destas matrículas na URBAN GO. Já foi aplicado?', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.contratos_renting WHERE org_id = v_urbango;
  IF v_n > 0 THEN RAISE EXCEPTION 'A URBAN GO já tem % contratos; o guião assume org sem contratos.', v_n; END IF;
  IF to_regclass('public.zz_transferencia_urbango_20261015') IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM public.zz_transferencia_urbango_20261015;
    IF v_n > 0 THEN RAISE EXCEPTION 'A tabela de mapa já tem % linhas: a transferência já foi aplicada.', v_n; END IF;
  END IF;

  CREATE TABLE IF NOT EXISTS public.zz_transferencia_urbango_20261015 (
    tabela text NOT NULL, old_id uuid NOT NULL, new_id uuid, nota text, created_at timestamptz DEFAULT now());
  REVOKE ALL ON public.zz_transferencia_urbango_20261015 FROM PUBLIC, anon, authenticated;

  CREATE TEMP TABLE tmp_map (tabela text, old_id uuid, new_id uuid, PRIMARY KEY (tabela, old_id)) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_viaturas ON COMMIT DROP AS
    SELECT v.* FROM public.viaturas v WHERE v.org_id = v_decada AND v.matricula = ANY(v_matriculas);
  CREATE TEMP TABLE tmp_vivos ON COMMIT DROP AS
    SELECT c.* FROM public.contratos_renting c JOIN tmp_viaturas v ON v.id = c.viatura_id
     WHERE c.deleted_at IS NULL AND c.substituido_em IS NULL AND c.estado_operacional IN ('agendado','em_curso');
  CREATE TEMP TABLE tmp_cadeia ON COMMIT DROP AS
    SELECT c.* FROM public.contratos_renting c JOIN tmp_vivos x ON x.codigo = c.codigo AND x.org_id = c.org_id
     WHERE c.deleted_at IS NULL;
  CREATE TEMP TABLE tmp_reservas ON COMMIT DROP AS
    SELECT r.* FROM public.reservas r WHERE r.id IN (SELECT reserva_id FROM tmp_cadeia WHERE reserva_id IS NOT NULL);
  CREATE TEMP TABLE tmp_clientes_ids ON COMMIT DROP AS
    SELECT DISTINCT x AS id FROM (
      SELECT cliente_id FROM tmp_cadeia
      UNION SELECT cliente_id FROM tmp_reservas
      UNION SELECT cc.cliente_id FROM public.contrato_condutores cc JOIN tmp_cadeia c ON c.id = cc.contrato_id
      UNION SELECT rc.cliente_id FROM public.reserva_condutores rc JOIN tmp_reservas r ON r.id = rc.reserva_id
      UNION SELECT cb.destinatario_id FROM public.contrato_cobrancas cb JOIN tmp_cadeia c ON c.id = cb.contrato_id
      UNION SELECT cm.entidade_id FROM public.conta_movimentos cm JOIN tmp_cadeia c ON c.id = cm.contrato_id
      UNION SELECT nc.entidade_id FROM public.notas_credito nc JOIN tmp_cadeia c ON c.id = nc.contrato_id
      UNION SELECT d.condutor_cliente_id FROM public.viatura_danos d JOIN tmp_viaturas v ON v.id = d.viatura_id
             WHERE d.estado NOT IN ('reparado','resolvido','anulado')
    ) q(x) WHERE x IS NOT NULL;

  -- ── Fase A: triggers de utilizador desligados ─────────────────────────
  FOREACH v_t IN ARRAY array['clientes','documentos','cliente_documentos','viaturas','viatura_documentos',
      'viatura_danos','viatura_dano_fotos','reservas','reserva_condutores','reserva_extras','contratos_renting',
      'contrato_condutores','contrato_extras','contrato_anexos','contrato_cobrancas','conta_movimentos',
      'notas_credito','calendario_eventos','document_templates','user_organizacoes','cargos','cargo_permissoes',
      'org_definicoes'] LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', v_t);
  END LOOP;

  -- ── 1. Dicionários da URBAN GO (cria o que falta, mapeia por nome) ───
  INSERT INTO public.viatura_marcas (org_id, nome, ativa)
    SELECT v_urbango, d.nome, true FROM public.viatura_marcas d
     WHERE d.id IN (SELECT marca_id FROM tmp_viaturas WHERE marca_id IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.viatura_marcas u WHERE u.org_id = v_urbango AND lower(u.nome) = lower(d.nome));
  INSERT INTO tmp_map SELECT 'viatura_marcas', d.id, u.id
    FROM public.viatura_marcas d JOIN public.viatura_marcas u ON u.org_id = v_urbango AND lower(u.nome) = lower(d.nome)
   WHERE d.id IN (SELECT marca_id FROM tmp_viaturas WHERE marca_id IS NOT NULL);

  INSERT INTO public.viatura_modelos (org_id, marca_id, nome, ativo, caixa, lugares, portas, bagageira, ar_condicionado, imagem_url)
    SELECT v_urbango, mm.new_id, d.nome, d.ativo, d.caixa, d.lugares, d.portas, d.bagageira, d.ar_condicionado, d.imagem_url
      FROM public.viatura_modelos d JOIN tmp_map mm ON mm.tabela = 'viatura_marcas' AND mm.old_id = d.marca_id
     WHERE d.id IN (SELECT modelo_id FROM tmp_viaturas WHERE modelo_id IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.viatura_modelos u WHERE u.org_id = v_urbango AND u.marca_id = mm.new_id AND lower(u.nome) = lower(d.nome));
  INSERT INTO tmp_map SELECT 'viatura_modelos', d.id, u.id
    FROM public.viatura_modelos d JOIN tmp_map mm ON mm.tabela = 'viatura_marcas' AND mm.old_id = d.marca_id
    JOIN public.viatura_modelos u ON u.org_id = v_urbango AND u.marca_id = mm.new_id AND lower(u.nome) = lower(d.nome)
   WHERE d.id IN (SELECT modelo_id FROM tmp_viaturas WHERE modelo_id IS NOT NULL);

  INSERT INTO public.viatura_tipos (org_id, nome, ativo, elegivel_tvde)
    SELECT v_urbango, d.nome, d.ativo, d.elegivel_tvde FROM public.viatura_tipos d
     WHERE d.id IN (SELECT tipo_id FROM tmp_viaturas WHERE tipo_id IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.viatura_tipos u WHERE u.org_id = v_urbango AND lower(u.nome) = lower(d.nome));
  INSERT INTO tmp_map SELECT 'viatura_tipos', d.id, u.id
    FROM public.viatura_tipos d JOIN public.viatura_tipos u ON u.org_id = v_urbango AND lower(u.nome) = lower(d.nome)
   WHERE d.id IN (SELECT tipo_id FROM tmp_viaturas WHERE tipo_id IS NOT NULL);

  INSERT INTO public.viatura_combustiveis (org_id, nome, ativo)
    SELECT v_urbango, d.nome, d.ativo FROM public.viatura_combustiveis d
     WHERE d.id IN (SELECT combustivel_id FROM tmp_viaturas WHERE combustivel_id IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.viatura_combustiveis u WHERE u.org_id = v_urbango AND lower(u.nome) = lower(d.nome));
  INSERT INTO tmp_map SELECT 'viatura_combustiveis', d.id, u.id
    FROM public.viatura_combustiveis d JOIN public.viatura_combustiveis u ON u.org_id = v_urbango AND lower(u.nome) = lower(d.nome)
   WHERE d.id IN (SELECT combustivel_id FROM tmp_viaturas WHERE combustivel_id IS NOT NULL);

  INSERT INTO public.renting_grupos (org_id, nome, codigo, descricao, imagem_url, ativo, codigo_sipp, idade_minima_condutor,
      idade_maxima_condutor, combustivel, capacidade_deposito, mapa_danos_url, mapa_danos_verso_url, isento_iva,
      reserva_min_minutos, reserva_max_minutos, marca_id, modelo_id, combustivel_id, tipo_id)
    SELECT v_urbango, d.nome, d.codigo, d.descricao, d.imagem_url, d.ativo, d.codigo_sipp, d.idade_minima_condutor,
           d.idade_maxima_condutor, d.combustivel, d.capacidade_deposito, d.mapa_danos_url, d.mapa_danos_verso_url, d.isento_iva,
           d.reserva_min_minutos, d.reserva_max_minutos,
           (SELECT new_id FROM tmp_map WHERE tabela = 'viatura_marcas' AND old_id = d.marca_id),
           (SELECT new_id FROM tmp_map WHERE tabela = 'viatura_modelos' AND old_id = d.modelo_id),
           (SELECT new_id FROM tmp_map WHERE tabela = 'viatura_combustiveis' AND old_id = d.combustivel_id),
           (SELECT new_id FROM tmp_map WHERE tabela = 'viatura_tipos' AND old_id = d.tipo_id)
      FROM public.renting_grupos d
     WHERE d.id IN (SELECT grupo_id FROM tmp_viaturas WHERE grupo_id IS NOT NULL
                    UNION SELECT grupo_id FROM tmp_cadeia WHERE grupo_id IS NOT NULL
                    UNION SELECT grupo_id FROM tmp_reservas WHERE grupo_id IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.renting_grupos u WHERE u.org_id = v_urbango AND lower(u.codigo) = lower(d.codigo));
  INSERT INTO tmp_map SELECT 'renting_grupos', d.id, u.id
    FROM public.renting_grupos d JOIN public.renting_grupos u ON u.org_id = v_urbango AND lower(u.codigo) = lower(d.codigo)
   WHERE d.id IN (SELECT grupo_id FROM tmp_viaturas WHERE grupo_id IS NOT NULL
                  UNION SELECT grupo_id FROM tmp_cadeia WHERE grupo_id IS NOT NULL
                  UNION SELECT grupo_id FROM tmp_reservas WHERE grupo_id IS NOT NULL);

  -- Proprietários: o nome é único a nível global (viatura_proprietarios_nome_normalizado_idx), logo partilham-se.
  INSERT INTO tmp_map SELECT 'viatura_proprietarios', d.id, d.id
    FROM public.viatura_proprietarios d
   WHERE d.id IN (SELECT proprietario_id FROM tmp_viaturas WHERE proprietario_id IS NOT NULL);

  INSERT INTO public.estacoes (org_id, nome, morada, cidade, ativa, horario, latitude, longitude)
    SELECT v_urbango, d.nome, d.morada, d.cidade, d.ativa, d.horario, d.latitude, d.longitude FROM public.estacoes d
     WHERE d.id IN (SELECT estacao_id FROM tmp_viaturas
                    UNION SELECT estacao_entrega_id FROM tmp_cadeia UNION SELECT estacao_recolha_id FROM tmp_cadeia
                    UNION SELECT estacao_origem_viatura_id FROM tmp_cadeia
                    UNION SELECT estacao_entrega_id FROM tmp_reservas UNION SELECT estacao_recolha_id FROM tmp_reservas)
       AND NOT EXISTS (SELECT 1 FROM public.estacoes u WHERE u.org_id = v_urbango AND lower(u.nome) = lower(d.nome));
  INSERT INTO tmp_map SELECT 'estacoes', d.id, u.id
    FROM public.estacoes d JOIN public.estacoes u ON u.org_id = v_urbango AND lower(u.nome) = lower(d.nome)
   WHERE d.id IN (SELECT estacao_id FROM tmp_viaturas
                  UNION SELECT estacao_entrega_id FROM tmp_cadeia UNION SELECT estacao_recolha_id FROM tmp_cadeia
                  UNION SELECT estacao_origem_viatura_id FROM tmp_cadeia
                  UNION SELECT estacao_entrega_id FROM tmp_reservas UNION SELECT estacao_recolha_id FROM tmp_reservas);

  INSERT INTO public.renting_extras (org_id, nome, descricao, preco_unidade, tipo_calculo, quantidade_maxima, ativo, created_by)
    SELECT v_urbango, d.nome, d.descricao, d.preco_unidade, d.tipo_calculo, d.quantidade_maxima, d.ativo, d.created_by
      FROM public.renting_extras d
     WHERE d.id IN (SELECT extra_id FROM public.contrato_extras WHERE contrato_id IN (SELECT id FROM tmp_cadeia)
                    UNION SELECT extra_id FROM public.reserva_extras WHERE reserva_id IN (SELECT id FROM tmp_reservas))
       AND NOT EXISTS (SELECT 1 FROM public.renting_extras u WHERE u.org_id = v_urbango AND lower(u.nome) = lower(d.nome));
  INSERT INTO tmp_map SELECT 'renting_extras', d.id, u.id
    FROM public.renting_extras d JOIN public.renting_extras u ON u.org_id = v_urbango AND lower(u.nome) = lower(d.nome)
   WHERE d.id IN (SELECT extra_id FROM public.contrato_extras WHERE contrato_id IN (SELECT id FROM tmp_cadeia)
                  UNION SELECT extra_id FROM public.reserva_extras WHERE reserva_id IN (SELECT id FROM tmp_reservas));

  INSERT INTO public.renting_tarifas (org_id, grupo_id, nome, preco_dia, preco_fim_semana, preco_semana, preco_mes, kms_incluidos,
      km_adicional_valor, valido_de, valido_ate, ativa, created_by, tipo, reserva_min_minutos, reserva_max_minutos, tarifa_site)
    SELECT v_urbango, (SELECT new_id FROM tmp_map WHERE tabela = 'renting_grupos' AND old_id = d.grupo_id), d.nome, d.preco_dia,
           d.preco_fim_semana, d.preco_semana, d.preco_mes, d.kms_incluidos, d.km_adicional_valor, d.valido_de, d.valido_ate,
           d.ativa, d.created_by, d.tipo, d.reserva_min_minutos, d.reserva_max_minutos, false
      FROM public.renting_tarifas d
     WHERE d.id IN (SELECT tarifa_id FROM tmp_cadeia UNION SELECT tarifa_id FROM tmp_reservas
                    UNION SELECT tarifa_id FROM public.contrato_cobrancas WHERE contrato_id IN (SELECT id FROM tmp_cadeia))
       AND NOT EXISTS (SELECT 1 FROM public.renting_tarifas u WHERE u.org_id = v_urbango AND lower(u.nome) = lower(d.nome));
  INSERT INTO tmp_map SELECT 'renting_tarifas', d.id, u.id
    FROM public.renting_tarifas d JOIN public.renting_tarifas u ON u.org_id = v_urbango AND lower(u.nome) = lower(d.nome)
   WHERE d.id IN (SELECT tarifa_id FROM tmp_cadeia UNION SELECT tarifa_id FROM tmp_reservas
                  UNION SELECT tarifa_id FROM public.contrato_cobrancas WHERE contrato_id IN (SELECT id FROM tmp_cadeia));

  -- ── 2. Clientes (cópia; os da Década ficam) ──────────────────────────
  INSERT INTO tmp_map SELECT 'clientes', id, gen_random_uuid() FROM tmp_clientes_ids;
  INSERT INTO public.clientes (id, is_empresa, nome, nome_comercial, nif, telefone, email, iban, observacoes, data_nascimento,
      naturalidade, codigo_postal, localidade, cidade, pais, deleted_at, created_by, updated_by, created_at, updated_at, genero,
      morada, org_id, tipo_cliente, sede, representante, cargo_representante, licenca_tvde, licenca_validade, papel_timbrado,
      logo_url, is_emissora, elegivel_anuncios)
    SELECT m.new_id, c.is_empresa, c.nome, c.nome_comercial, c.nif, c.telefone, c.email, c.iban, c.observacoes, c.data_nascimento,
           c.naturalidade, c.codigo_postal, c.localidade, c.cidade, c.pais, c.deleted_at, c.created_by, c.updated_by, c.created_at,
           c.updated_at, c.genero, c.morada, v_urbango, c.tipo_cliente, c.sede, c.representante, c.cargo_representante,
           c.licenca_tvde, c.licenca_validade, c.papel_timbrado, c.logo_url, false, c.elegivel_anuncios
      FROM public.clientes c JOIN tmp_map m ON m.tabela = 'clientes' AND m.old_id = c.id;

  INSERT INTO tmp_map SELECT 'documentos', d.id, gen_random_uuid() FROM public.documentos d
   WHERE d.id IN (SELECT documento_id FROM public.cliente_documentos WHERE cliente_id IN (SELECT id FROM tmp_clientes_ids));
  INSERT INTO public.documentos (id, tipo, numero, pais_emissao, data_emissao, validade, arquivo_url, created_by, updated_by,
      created_at, updated_at, org_id)
    SELECT m.new_id, d.tipo, d.numero, d.pais_emissao, d.data_emissao, d.validade, d.arquivo_url, d.created_by, d.updated_by,
           d.created_at, d.updated_at, v_urbango
      FROM public.documentos d JOIN tmp_map m ON m.tabela = 'documentos' AND m.old_id = d.id;
  INSERT INTO public.cliente_documentos (cliente_id, documento_id, created_by, created_at, org_id)
    SELECT mc.new_id, md.new_id, cd.created_by, cd.created_at, v_urbango
      FROM public.cliente_documentos cd
      JOIN tmp_map mc ON mc.tabela = 'clientes' AND mc.old_id = cd.cliente_id
      JOIN tmp_map md ON md.tabela = 'documentos' AND md.old_id = cd.documento_id;

  -- ── 3. Viaturas ──────────────────────────────────────────────────────
  INSERT INTO tmp_map SELECT 'viaturas', id, gen_random_uuid() FROM tmp_viaturas;
  INSERT INTO public.viaturas (id, matricula, marca, modelo, ano, cor, categoria, combustivel, status, km_atual, seguro_numero,
      seguro_validade, inspecao_validade, observacoes, created_at, updated_at, numero_motor, numero_chassis, data_matricula,
      seguradora, obe_numero, obe_estado, valor_aluguer, is_slot, proprietario_id, data_venda, estacao_id, tipo_frota,
      tipo_financiamento, custo_viatura, custos_operacionais, custos_adicionais, impostos_aquisicao, total_viatura, iva_tipo,
      data_primeiro_pagamento, num_prestacoes, valor_prestacao, valor_residual, limite_kms, custo_km_adicional, data_aquisicao,
      data_validade_financeira, metodo_depreciacao, vida_util_anos, is_vendida, valor_venda, venda_observacoes, checklist_saida,
      extintor_numero, extintor_validade, tipo_id, valor_mensal, valor_diario, limite_km_mensal, org_id, grupo_id, marca_id,
      modelo_id, combustivel_id, habilitada_tvde, emissor_id, proxima_manutencao_data, proxima_manutencao_km, elegivel_anuncios)
    SELECT m.new_id, v.matricula, v.marca, v.modelo, v.ano, v.cor, v.categoria, v.combustivel,
           CASE WHEN EXISTS (SELECT 1 FROM tmp_vivos x WHERE x.viatura_id = v.id AND x.estado_operacional = 'em_curso') THEN 'em_uso'
                WHEN EXISTS (SELECT 1 FROM tmp_vivos x WHERE x.viatura_id = v.id AND x.estado_operacional = 'agendado') THEN 'reservada'
                ELSE 'disponivel' END,
           v.km_atual, v.seguro_numero, v.seguro_validade, v.inspecao_validade, v.observacoes, v.created_at, v.updated_at,
           v.numero_motor, v.numero_chassis, v.data_matricula, v.seguradora, v.obe_numero, v.obe_estado, v.valor_aluguer, v.is_slot,
           (SELECT new_id FROM tmp_map WHERE tabela = 'viatura_proprietarios' AND old_id = v.proprietario_id), v.data_venda,
           (SELECT new_id FROM tmp_map WHERE tabela = 'estacoes' AND old_id = v.estacao_id), v.tipo_frota,
           v.tipo_financiamento, v.custo_viatura, v.custos_operacionais, v.custos_adicionais, v.impostos_aquisicao, v.total_viatura,
           v.iva_tipo, v.data_primeiro_pagamento, v.num_prestacoes, v.valor_prestacao, v.valor_residual, v.limite_kms,
           v.custo_km_adicional, v.data_aquisicao, v.data_validade_financeira, v.metodo_depreciacao, v.vida_util_anos, v.is_vendida,
           v.valor_venda, v.venda_observacoes, v.checklist_saida, v.extintor_numero, v.extintor_validade,
           (SELECT new_id FROM tmp_map WHERE tabela = 'viatura_tipos' AND old_id = v.tipo_id), v.valor_mensal, v.valor_diario,
           v.limite_km_mensal, v_urbango,
           (SELECT new_id FROM tmp_map WHERE tabela = 'renting_grupos' AND old_id = v.grupo_id),
           (SELECT new_id FROM tmp_map WHERE tabela = 'viatura_marcas' AND old_id = v.marca_id),
           (SELECT new_id FROM tmp_map WHERE tabela = 'viatura_modelos' AND old_id = v.modelo_id),
           (SELECT new_id FROM tmp_map WHERE tabela = 'viatura_combustiveis' AND old_id = v.combustivel_id),
           v.habilitada_tvde, NULL, v.proxima_manutencao_data, v.proxima_manutencao_km, v.elegivel_anuncios
      FROM tmp_viaturas v JOIN tmp_map m ON m.tabela = 'viaturas' AND m.old_id = v.id;

  INSERT INTO public.viatura_documentos (viatura_id, tipo_documento, nome_ficheiro, ficheiro_url, data_validade, observacoes,
      uploaded_by, created_at, updated_at, org_id, ordem, miniatura_url)
    SELECT m.new_id, d.tipo_documento, d.nome_ficheiro, d.ficheiro_url, d.data_validade, d.observacoes, d.uploaded_by,
           d.created_at, d.updated_at, v_urbango, d.ordem, d.miniatura_url
      FROM public.viatura_documentos d JOIN tmp_map m ON m.tabela = 'viaturas' AND m.old_id = d.viatura_id;

  -- ── 4. Reservas ──────────────────────────────────────────────────────
  INSERT INTO tmp_map SELECT 'reservas', id, gen_random_uuid() FROM tmp_reservas;
  INSERT INTO public.reservas (id, org_id, codigo, viatura_id, matricula, grupo, estacao_entrega_id, estacao_recolha_id, data_inicio,
      data_fim, cliente_id, cliente_nome, condutor_id, condutor_nome, estado, valor_total, observacoes, deleted_at, created_by,
      updated_by, created_at, updated_at, is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias, franquia_valor, caucao_valor,
      kms_incluidos, km_adicional_valor, observacoes_internas, grupo_id, grupo_nome, tarifa_id, tarifa_nome, tarifa_preco_dia,
      cobertura_id, cobertura_nome, cobertura_preco_dia, cobertura_franquia, regime, desconto, valor_total_manual,
      slot_valor_semanal, emissor_id, gestor_id, slot_valor_mensal, origem, modelo_id, api_chave_id, referencia_externa, dados_site)
    SELECT m.new_id, v_urbango, r.codigo,
           (SELECT new_id FROM tmp_map WHERE tabela = 'viaturas' AND old_id = r.viatura_id), r.matricula, r.grupo,
           (SELECT new_id FROM tmp_map WHERE tabela = 'estacoes' AND old_id = r.estacao_entrega_id),
           (SELECT new_id FROM tmp_map WHERE tabela = 'estacoes' AND old_id = r.estacao_recolha_id),
           r.data_inicio, r.data_fim,
           (SELECT new_id FROM tmp_map WHERE tabela = 'clientes' AND old_id = r.cliente_id), r.cliente_nome, NULL, r.condutor_nome,
           r.estado, r.valor_total, r.observacoes, r.deleted_at, r.created_by, r.updated_by, r.created_at, r.updated_at,
           r.is_longa_duracao, r.renovacao_opcao, r.renovacao_intervalo_dias, r.franquia_valor, r.caucao_valor, r.kms_incluidos,
           r.km_adicional_valor, r.observacoes_internas,
           (SELECT new_id FROM tmp_map WHERE tabela = 'renting_grupos' AND old_id = r.grupo_id), r.grupo_nome,
           (SELECT new_id FROM tmp_map WHERE tabela = 'renting_tarifas' AND old_id = r.tarifa_id), r.tarifa_nome, r.tarifa_preco_dia,
           NULL, r.cobertura_nome, r.cobertura_preco_dia, r.cobertura_franquia, r.regime, r.desconto, r.valor_total_manual,
           r.slot_valor_semanal, v_emissora_urb, r.gestor_id, r.slot_valor_mensal, r.origem, NULL, NULL, r.referencia_externa,
           r.dados_site
      FROM tmp_reservas r JOIN tmp_map m ON m.tabela = 'reservas' AND m.old_id = r.id;

  INSERT INTO public.reserva_condutores (org_id, reserva_id, cliente_id, is_principal, created_by, created_at, motorista_id)
    SELECT v_urbango, m.new_id, (SELECT new_id FROM tmp_map WHERE tabela = 'clientes' AND old_id = rc.cliente_id), rc.is_principal,
           rc.created_by, rc.created_at, NULL
      FROM public.reserva_condutores rc JOIN tmp_map m ON m.tabela = 'reservas' AND m.old_id = rc.reserva_id;
  INSERT INTO public.reserva_extras (org_id, reserva_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total,
      created_by, created_at)
    SELECT v_urbango, m.new_id, me.new_id, x.extra_nome, x.preco_unidade, x.tipo_calculo, x.quantidade, x.total, x.created_by,
           x.created_at
      FROM public.reserva_extras x JOIN tmp_map m ON m.tabela = 'reservas' AND m.old_id = x.reserva_id
      JOIN tmp_map me ON me.tabela = 'renting_extras' AND me.old_id = x.extra_id;

  -- ── 5. Contratos (todas as versões da cadeia, por ordem) ─────────────
  INSERT INTO tmp_map SELECT 'contratos_renting', id, gen_random_uuid() FROM tmp_cadeia;
  INSERT INTO public.contratos_renting (id, org_id, codigo, reserva_id, cliente_id, viatura_id, matricula, grupo, estacao_entrega_id,
      data_inicio, estacao_recolha_id, data_fim, estacao_origem_viatura_id, estado_operacional, estado_financeiro, origem,
      tarifa_diaria, desconto_percentagem, taxa_iva, valor_total_manual, total_subtotal, total_iva, total_final, facturado_em,
      voucher_codigo, numero_processo, voo_referencia, local_entrega, local_recolha, comentarios_entrega, comentarios_recolha,
      observacoes, deleted_at, created_by, updated_by, created_at, updated_at, aluguer_longa_duracao, renovacao_opcao,
      renovacao_intervalo_dias, franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor, observacoes_internas, grupo_id,
      grupo_nome, tarifa_id, tarifa_nome, cobertura_id, cobertura_nome, cobertura_preco_dia, cobertura_franquia, is_longa_duracao,
      regime, transferista_id, versao, contrato_anterior_id, substituido_em, motivo_versao, emissor_id, gestor_id, km_saida,
      km_entrada, combustivel_saida, combustivel_entrada, eletricidade_saida, eletricidade_entrada, dua_original_com_motorista,
      dua_devolvida_em, dua_observacoes, entrega_via_any_rent, cidade_assinatura, tipo_fecho, proxima_renovacao_em)
    SELECT m.new_id, v_urbango, c.codigo,
           (SELECT new_id FROM tmp_map WHERE tabela = 'reservas' AND old_id = c.reserva_id),
           (SELECT new_id FROM tmp_map WHERE tabela = 'clientes' AND old_id = c.cliente_id),
           (SELECT new_id FROM tmp_map WHERE tabela = 'viaturas' AND old_id = c.viatura_id), c.matricula, c.grupo,
           (SELECT new_id FROM tmp_map WHERE tabela = 'estacoes' AND old_id = c.estacao_entrega_id), c.data_inicio,
           (SELECT new_id FROM tmp_map WHERE tabela = 'estacoes' AND old_id = c.estacao_recolha_id), c.data_fim,
           (SELECT new_id FROM tmp_map WHERE tabela = 'estacoes' AND old_id = c.estacao_origem_viatura_id),
           c.estado_operacional, c.estado_financeiro, c.origem, c.tarifa_diaria, c.desconto_percentagem, c.taxa_iva,
           c.valor_total_manual, c.total_subtotal, c.total_iva, c.total_final, c.facturado_em, c.voucher_codigo, c.numero_processo,
           c.voo_referencia, c.local_entrega, c.local_recolha, c.comentarios_entrega, c.comentarios_recolha, c.observacoes,
           c.deleted_at, c.created_by, c.updated_by, c.created_at, c.updated_at, c.aluguer_longa_duracao, c.renovacao_opcao,
           c.renovacao_intervalo_dias, c.franquia_valor, c.caucao_valor, c.kms_incluidos, c.km_adicional_valor,
           c.observacoes_internas,
           (SELECT new_id FROM tmp_map WHERE tabela = 'renting_grupos' AND old_id = c.grupo_id), c.grupo_nome,
           (SELECT new_id FROM tmp_map WHERE tabela = 'renting_tarifas' AND old_id = c.tarifa_id), c.tarifa_nome,
           NULL, c.cobertura_nome, c.cobertura_preco_dia, c.cobertura_franquia, c.is_longa_duracao, c.regime, c.transferista_id,
           c.versao, (SELECT new_id FROM tmp_map WHERE tabela = 'contratos_renting' AND old_id = c.contrato_anterior_id),
           c.substituido_em, c.motivo_versao, v_emissora_urb, c.gestor_id, c.km_saida, c.km_entrada, c.combustivel_saida,
           c.combustivel_entrada, c.eletricidade_saida, c.eletricidade_entrada, c.dua_original_com_motorista, c.dua_devolvida_em,
           c.dua_observacoes, c.entrega_via_any_rent, c.cidade_assinatura, c.tipo_fecho, c.proxima_renovacao_em
      FROM tmp_cadeia c JOIN tmp_map m ON m.tabela = 'contratos_renting' AND m.old_id = c.id
     ORDER BY c.codigo, c.versao;

  INSERT INTO public.contrato_condutores (org_id, contrato_id, cliente_id, is_principal, created_by, created_at, data_inicio,
      data_fim, motivo_fim, updated_at, motorista_id)
    SELECT v_urbango, m.new_id, (SELECT new_id FROM tmp_map WHERE tabela = 'clientes' AND old_id = cc.cliente_id), cc.is_principal,
           cc.created_by, cc.created_at, cc.data_inicio, cc.data_fim, cc.motivo_fim, cc.updated_at, NULL
      FROM public.contrato_condutores cc JOIN tmp_map m ON m.tabela = 'contratos_renting' AND m.old_id = cc.contrato_id;
  INSERT INTO public.contrato_extras (org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total,
      created_by, created_at)
    SELECT v_urbango, m.new_id, me.new_id, x.extra_nome, x.preco_unidade, x.tipo_calculo, x.quantidade, x.total, x.created_by,
           x.created_at
      FROM public.contrato_extras x JOIN tmp_map m ON m.tabela = 'contratos_renting' AND m.old_id = x.contrato_id
      JOIN tmp_map me ON me.tabela = 'renting_extras' AND me.old_id = x.extra_id;
  INSERT INTO public.contrato_anexos (org_id, contrato_id, nome, ficheiro_url, tamanho_bytes, mime_type, descricao, created_by,
      created_at, updated_at)
    SELECT v_urbango, m.new_id, a.nome, a.ficheiro_url, a.tamanho_bytes, a.mime_type, a.descricao, a.created_by, a.created_at,
           a.updated_at
      FROM public.contrato_anexos a JOIN tmp_map m ON m.tabela = 'contratos_renting' AND m.old_id = a.contrato_id;

  -- ── 6. Dinheiro: muda de org (guarda os valores antigos para desfazer) ─
  INSERT INTO public.zz_transferencia_urbango_20261015 (tabela, old_id, new_id, nota)
    SELECT 'contrato_cobrancas.movida', cb.id, NULL, jsonb_build_object('org_id', cb.org_id, 'contrato_id', cb.contrato_id,
           'reserva_id', cb.reserva_id, 'destinatario_id', cb.destinatario_id, 'tarifa_id', cb.tarifa_id)::text
      FROM public.contrato_cobrancas cb WHERE cb.contrato_id IN (SELECT id FROM tmp_cadeia);
  UPDATE public.contrato_cobrancas cb
     SET org_id = v_urbango,
         contrato_id = (SELECT new_id FROM tmp_map WHERE tabela = 'contratos_renting' AND old_id = cb.contrato_id),
         reserva_id = (SELECT new_id FROM tmp_map WHERE tabela = 'reservas' AND old_id = cb.reserva_id),
         destinatario_id = COALESCE((SELECT new_id FROM tmp_map WHERE tabela = 'clientes' AND old_id = cb.destinatario_id), cb.destinatario_id),
         tarifa_id = (SELECT new_id FROM tmp_map WHERE tabela = 'renting_tarifas' AND old_id = cb.tarifa_id)
   WHERE cb.contrato_id IN (SELECT id FROM tmp_cadeia);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_rel := v_rel || format(E'\ncobranças movidas: %s', v_n);

  INSERT INTO public.zz_transferencia_urbango_20261015 (tabela, old_id, new_id, nota)
    SELECT 'conta_movimentos.movido', cm.id, NULL, jsonb_build_object('org_id', cm.org_id, 'entidade_id', cm.entidade_id,
           'contrato_id', cm.contrato_id)::text
      FROM public.conta_movimentos cm WHERE cm.contrato_id IN (SELECT id FROM tmp_cadeia);
  UPDATE public.conta_movimentos cm
     SET org_id = v_urbango,
         entidade_id = COALESCE((SELECT new_id FROM tmp_map WHERE tabela = 'clientes' AND old_id = cm.entidade_id), cm.entidade_id),
         contrato_id = (SELECT new_id FROM tmp_map WHERE tabela = 'contratos_renting' AND old_id = cm.contrato_id)
   WHERE cm.contrato_id IN (SELECT id FROM tmp_cadeia);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_rel := v_rel || format(E'\nmovimentos de conta corrente movidos: %s', v_n);

  INSERT INTO public.zz_transferencia_urbango_20261015 (tabela, old_id, new_id, nota)
    SELECT 'notas_credito.movida', nc.id, NULL, jsonb_build_object('org_id', nc.org_id, 'entidade_id', nc.entidade_id,
           'contrato_id', nc.contrato_id)::text
      FROM public.notas_credito nc WHERE nc.contrato_id IN (SELECT id FROM tmp_cadeia);
  UPDATE public.notas_credito nc
     SET org_id = v_urbango,
         entidade_id = COALESCE((SELECT new_id FROM tmp_map WHERE tabela = 'clientes' AND old_id = nc.entidade_id), nc.entidade_id),
         contrato_id = (SELECT new_id FROM tmp_map WHERE tabela = 'contratos_renting' AND old_id = nc.contrato_id)
   WHERE nc.contrato_id IN (SELECT id FROM tmp_cadeia);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_rel := v_rel || format(E'\nnotas de crédito movidas: %s', v_n);

  -- ── 7. Danos activos e fotos ─────────────────────────────────────────
  INSERT INTO tmp_map SELECT 'viatura_danos', d.id, gen_random_uuid()
    FROM public.viatura_danos d JOIN tmp_viaturas v ON v.id = d.viatura_id
   WHERE d.estado NOT IN ('reparado','resolvido','anulado');
  INSERT INTO public.viatura_danos (id, viatura_id, descricao, localizacao, data_registo, estado, observacoes, registado_por,
      created_at, updated_at, motorista_id, contrato_id, valor, valor_cobrado, data_ocorrencia, ticket_id, contrato_id_origem,
      org_id, contrato_renting_id, condutor_cliente_id, cobranca_id, registo_fotografico, realizacao_token_id, categoria_id)
    SELECT m.new_id, (SELECT new_id FROM tmp_map WHERE tabela = 'viaturas' AND old_id = d.viatura_id), d.descricao, d.localizacao,
           d.data_registo, d.estado, d.observacoes, d.registado_por, d.created_at, d.updated_at, NULL, NULL, d.valor,
           d.valor_cobrado, d.data_ocorrencia, NULL, NULL, v_urbango,
           (SELECT new_id FROM tmp_map WHERE tabela = 'contratos_renting' AND old_id = d.contrato_renting_id),
           (SELECT new_id FROM tmp_map WHERE tabela = 'clientes' AND old_id = d.condutor_cliente_id),
           CASE WHEN EXISTS (SELECT 1 FROM public.contrato_cobrancas cb WHERE cb.id = d.cobranca_id AND cb.org_id = v_urbango)
                THEN d.cobranca_id END,
           d.registo_fotografico, NULL, NULL
      FROM public.viatura_danos d JOIN tmp_map m ON m.tabela = 'viatura_danos' AND m.old_id = d.id;
  INSERT INTO public.viatura_dano_fotos (dano_id, ficheiro_url, nome_ficheiro, descricao, uploaded_by, created_at, contrato_id, org_id)
    SELECT m.new_id, f.ficheiro_url, f.nome_ficheiro, f.descricao, f.uploaded_by, f.created_at, NULL, v_urbango
      FROM public.viatura_dano_fotos f JOIN tmp_map m ON m.tabela = 'viatura_danos' AND m.old_id = f.dano_id;

  -- ── 8. Agenda: eventos dos contratos vivos (entrega/recolha), estado incluído ─
  INSERT INTO public.calendario_eventos (titulo, descricao, tipo, data_inicio, data_fim, dia_todo, criado_por,
      lembrete_enviado_vespera, lembrete_enviado_dia, created_at, updated_at, cidade, matricula_devolver, motorista_id, org_id,
      origem_tipo, origem_id, realizado_por_id, realizado_em)
    SELECT e.titulo, e.descricao, e.tipo, e.data_inicio, e.data_fim, e.dia_todo, e.criado_por, e.lembrete_enviado_vespera,
           e.lembrete_enviado_dia, e.created_at, e.updated_at, e.cidade, e.matricula_devolver, NULL, v_urbango, e.origem_tipo,
           m.new_id, e.realizado_por_id, e.realizado_em
      FROM public.calendario_eventos e
      JOIN tmp_vivos x ON x.id = e.origem_id
      JOIN tmp_map m ON m.tabela = 'contratos_renting' AND m.old_id = e.origem_id
     WHERE e.origem_tipo = 'contrato_renting';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_rel := v_rel || format(E'\neventos de agenda copiados: %s', v_n);

  -- ── 9. Emissora, template e definições da URBAN GO ───────────────────
  INSERT INTO public.document_templates (nome, tipo, empresa_id, template_data, campos_dinamicos, ativo, versao, criado_por,
      papel_timbrado_url, org_id, cliente_empresa_id)
    -- empresa_id NULL e versao 2: os índices únicos (empresa_id, tipo, versao) e (cliente_empresa_id, tipo, versao)
    -- já têm o template curto da Urbango na versão 1.
    SELECT 'Contrato Aluguer - Urbango', t.tipo, NULL,
           jsonb_set(t.template_data, '{conteudo}', to_jsonb(
             replace(replace(replace(t.template_data->>'conteudo',
               'a Dasprent, adiante designada LOCADORA',
               'a Urbango, Lda, adiante designada LOCADORA'),
               'DASPRENT RENT A CAR LDA, NIF 516989820, com sede na Rua Dionisio Rodrigues 60, 2415-801 Leiria',
               'URBANGO, LDA, NIF 506589595, com sede na Rua do Mourato, Nº 70A, Correio 101, 9600-224 Ribeira Grande'),
               'mailto:geral@dasprent.pt">geral@dasprent.pt</a> ou por carta registada para N1 1450, 2400-828 Leiria',
               'mailto:geral@urbango.pt">geral@urbango.pt</a> ou por carta registada para Rua do Mourato, Nº 70A, Correio 101, 9600-224 Ribeira Grande'))),
           t.campos_dinamicos, true, 2, t.criado_por, t.papel_timbrado_url, v_urbango, v_emissora_urb
      FROM public.document_templates t WHERE t.id = v_template_fonte
    RETURNING id INTO v_template_novo;
  IF v_template_novo IS NULL THEN RAISE EXCEPTION 'Template fonte % não encontrado.', v_template_fonte; END IF;
  SELECT count(*) INTO v_n FROM regexp_matches((SELECT template_data->>'conteudo' FROM public.document_templates WHERE id = v_template_novo), 'dasprent', 'gi');
  IF v_n > 0 THEN RAISE EXCEPTION 'O template novo ainda menciona Dasprent % vez(es).', v_n; END IF;
  UPDATE public.document_templates SET ativo = false WHERE id = v_template_curto AND org_id = v_urbango;
  v_rel := v_rel || E'\ntemplate "Contrato Aluguer - Urbango" criado na URBAN GO; o curto ficou inactivo';

  UPDATE public.clientes u
     SET email = COALESCE(u.email, d.email), telefone = COALESCE(u.telefone, d.telefone), morada = COALESCE(u.morada, d.morada),
         codigo_postal = COALESCE(u.codigo_postal, d.codigo_postal), localidade = COALESCE(u.localidade, d.localidade),
         cidade = COALESCE(u.cidade, d.cidade), cargo_representante = COALESCE(u.cargo_representante, d.cargo_representante)
    FROM public.clientes d WHERE u.id = v_emissora_urb AND d.id = v_emissora_dec;
  UPDATE public.org_definicoes SET emissor_rent_a_car_id = v_emissora_urb WHERE org_id = v_urbango AND emissor_rent_a_car_id IS NULL;

  -- ── 10. Utilizadores: Thiago (admin) e Ivone (cargo Faturação copiado) ─
  INSERT INTO public.cargos (nome, descricao, org_id)
    SELECT c.nome, c.descricao, v_urbango FROM public.cargos c
     WHERE c.id = v_cargo_fat_dec
       AND NOT EXISTS (SELECT 1 FROM public.cargos u WHERE u.org_id = v_urbango AND lower(u.nome) = lower(c.nome));
  SELECT u.id INTO v_cargo_fat_urb FROM public.cargos u JOIN public.cargos c ON lower(c.nome) = lower(u.nome)
   WHERE c.id = v_cargo_fat_dec AND u.org_id = v_urbango ORDER BY u.created_at LIMIT 1;
  INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, pode_editar, org_id)
    SELECT v_cargo_fat_urb, p.recurso_id, p.tem_acesso, p.pode_editar, v_urbango FROM public.cargo_permissoes p
     WHERE p.cargo_id = v_cargo_fat_dec
       AND NOT EXISTS (SELECT 1 FROM public.cargo_permissoes q WHERE q.cargo_id = v_cargo_fat_urb AND q.recurso_id = p.recurso_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.user_organizacoes (user_id, org_id, role, cargo_id, is_admin)
    SELECT v_thiago, v_urbango, 'member', v_cargo_admin_urb, true
     WHERE NOT EXISTS (SELECT 1 FROM public.user_organizacoes WHERE user_id = v_thiago AND org_id = v_urbango);
  INSERT INTO public.user_organizacoes (user_id, org_id, role, cargo_id, is_admin)
    SELECT v_ivone, v_urbango, 'member', v_cargo_fat_urb, false
     WHERE NOT EXISTS (SELECT 1 FROM public.user_organizacoes WHERE user_id = v_ivone AND org_id = v_urbango);
  v_rel := v_rel || format(E'\nutilizadores: Thiago admin; Ivone com cargo Faturação (%s permissões copiadas)', v_n);

  -- ── Fim da fase A: triggers de volta ──────────────────────────────────
  FOREACH v_t IN ARRAY array['clientes','documentos','cliente_documentos','viaturas','viatura_documentos',
      'viatura_danos','viatura_dano_fotos','reservas','reserva_condutores','reserva_extras','contratos_renting',
      'contrato_condutores','contrato_extras','contrato_anexos','contrato_cobrancas','conta_movimentos',
      'notas_credito','calendario_eventos','document_templates','user_organizacoes','cargos','cargo_permissoes',
      'org_definicoes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', v_t);
  END LOOP;

  -- ── Fase B: Década Ousada (triggers ligados) ─────────────────────────
  INSERT INTO public.zz_transferencia_urbango_20261015 (tabela, old_id, new_id, nota)
    SELECT 'viaturas.status_antes', id, NULL, status FROM tmp_viaturas;
  INSERT INTO public.zz_transferencia_urbango_20261015 (tabela, old_id, new_id, nota)
    SELECT 'contratos_renting.estado_antes', id, NULL, estado_operacional::text FROM tmp_vivos;
  INSERT INTO public.zz_transferencia_urbango_20261015 (tabela, old_id, new_id, nota)
    SELECT 'reservas.estado_antes', id, NULL, estado::text FROM tmp_reservas;
  INSERT INTO public.zz_transferencia_urbango_20261015 (tabela, old_id, new_id, nota)
    SELECT 'calendario_eventos.pendente_antes', e.id, NULL, e.descricao
      FROM public.calendario_eventos e JOIN tmp_vivos x ON x.id = e.origem_id
     WHERE e.origem_tipo = 'contrato_renting' AND e.realizado_em IS NULL;

  -- Inativo primeiro: assim a cascata do fecho não devolve a viatura a "disponível".
  UPDATE public.viaturas SET status = 'inativo' WHERE id IN (SELECT id FROM tmp_viaturas);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_rel := v_rel || format(E'\nDécada: viaturas postas inativas: %s', v_n);

  UPDATE public.contratos_renting c
     SET estado_operacional = (CASE WHEN c.estado_operacional = 'agendado' THEN 'cancelado' ELSE 'fechado' END)::public.contrato_estado_operacional_enum,
         observacoes_internas = concat_ws(E'\n', NULLIF(c.observacoes_internas, ''),
           'Transferido para a URBAN GO a 2026-10-15 (mesmo número de contrato).')
   WHERE c.id IN (SELECT id FROM tmp_vivos);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_rel := v_rel || format(E'\nDécada: contratos encerrados: %s', v_n);

  -- As recolhas pendentes na agenda da Década ficam dadas como realizadas: a viatura já não é dela.
  UPDATE public.calendario_eventos e
     SET realizado_em = now(), realizado_por_id = v_thiago,
         descricao = concat_ws(E'\n', NULLIF(e.descricao, ''), 'Transferido para a URBAN GO a 2026-10-15.')
   WHERE e.origem_tipo = 'contrato_renting' AND e.realizado_em IS NULL AND e.origem_id IN (SELECT id FROM tmp_vivos);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_rel := v_rel || format(E'\nDécada: eventos de agenda pendentes dados como realizados: %s', v_n);

  -- ── Mapa persistido e relatório ──────────────────────────────────────
  INSERT INTO public.zz_transferencia_urbango_20261015 (tabela, old_id, new_id) SELECT tabela, old_id, new_id FROM tmp_map;

  FOR rec IN SELECT tabela, count(*) AS n FROM tmp_map GROUP BY tabela ORDER BY tabela LOOP
    v_rel := v_rel || format(E'\nmapeados %s: %s', rec.tabela, rec.n);
  END LOOP;

  SELECT count(*) INTO v_n FROM public.contratos_renting c WHERE c.org_id = v_urbango AND c.contrato_anterior_id IS NULL AND c.versao > 1;
  v_rel := v_rel || format(E'\nversões >1 sem antecessor na cadeia (fora da cadeia na Década): %s', v_n);
  SELECT count(*) INTO v_n FROM public.contrato_cobrancas cb WHERE cb.org_id = v_urbango
     AND NOT EXISTS (SELECT 1 FROM public.clientes cl WHERE cl.id = cb.destinatario_id AND cl.org_id = v_urbango);
  v_rel := v_rel || format(E'\ncobranças na URBAN GO com destinatário fora da org (deve ser 0): %s', v_n);
  SELECT count(*) INTO v_n FROM public.conta_movimentos cm WHERE cm.org_id = v_urbango
     AND NOT EXISTS (SELECT 1 FROM public.clientes cl WHERE cl.id = cm.entidade_id AND cl.org_id = v_urbango);
  v_rel := v_rel || format(E'\nmovimentos na URBAN GO com entidade fora da org (deve ser 0): %s', v_n);
  SELECT count(*), count(*) FILTER (WHERE status = 'em_uso') INTO v_n, v_n2 FROM public.viaturas WHERE org_id = v_urbango;
  v_rel := v_rel || format(E'\nURBAN GO agora: %s viaturas (%s em uso), %s contratos (%s vivos), %s reservas, %s clientes',
     v_n, v_n2,
     (SELECT count(*) FROM public.contratos_renting WHERE org_id = v_urbango),
     (SELECT count(*) FROM public.contratos_renting WHERE org_id = v_urbango AND substituido_em IS NULL AND estado_operacional IN ('agendado','em_curso')),
     (SELECT count(*) FROM public.reservas WHERE org_id = v_urbango),
     (SELECT count(*) FROM public.clientes WHERE org_id = v_urbango));
  SELECT count(*) INTO v_n FROM public.viaturas v JOIN tmp_viaturas t ON t.id = v.id WHERE v.status = 'inativo';
  SELECT count(*) INTO v_n2 FROM public.reservas r JOIN tmp_reservas t ON t.id = r.id WHERE r.estado IN ('concluida','cancelada');
  v_rel := v_rel || format(E'\nDécada depois: %s viaturas inativas, %s reservas concluídas/canceladas', v_n, v_n2);

  IF v_ensaio THEN
    RAISE EXCEPTION 'ENSAIO (tudo rolado para trás):%', v_rel;
  END IF;
  RAISE NOTICE 'APLICADO:%', v_rel;
END $$;
