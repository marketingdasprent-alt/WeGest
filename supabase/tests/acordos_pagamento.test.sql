-- supabase/tests/acordos_pagamento.test.sql
begin;
select plan(18);

-- ── META: RLS e isolamento multi-tenant ────────────────────────────────
select has_table('public', 'acordos_pagamento', 'tabela acordos_pagamento existe');
select has_table('public', 'acordo_parcelas',   'tabela acordo_parcelas existe');

select is(
  (select relrowsecurity from pg_class where oid = 'public.acordos_pagamento'::regclass),
  true, 'acordos_pagamento tem RLS activa');

select is(
  (select count(*)::int from pg_policies
    where schemaname='public' and tablename='acordos_pagamento'
      and policyname='rls_org_isolation' and permissive='RESTRICTIVE'),
  1, 'acordos_pagamento tem a policy RESTRICTIVE rls_org_isolation');

select is(
  (select count(*)::int from pg_policies
    where schemaname='public' and tablename='acordo_parcelas'
      and policyname='rls_org_isolation' and permissive='RESTRICTIVE'),
  1, 'acordo_parcelas tem a policy RESTRICTIVE rls_org_isolation');

-- ── Seed próprio, dentro da transação ──────────────────────────────────
-- NÃO reutilizar linhas existentes: o teste tem de dar o mesmo resultado numa
-- base vazia e numa base cheia. O rollback no fim limpa tudo.
--
-- Colunas NOT NULL sem valor utilizável por omissão, inspecionadas nas migrations:
--   organizacoes        (20260513100001) → nome, codigo (UNIQUE)
--   clientes             (20260515000002) → nome (nif é opcional — e validado
--                          por trg_validar_nif_iban/nif_pt_valido em
--                          20260611000002; omitido de propósito no seed).
--                          org_id tornou-se NOT NULL em 20260530000000, com
--                          DEFAULT get_current_org_id() — mas essa função lê
--                          user_org_ativa via auth.uid(), que é NULL fora de
--                          uma sessão autenticada, por isso org_id TEM de ser
--                          passado explicitamente aqui.
--   viaturas             (20260123125903) → matricula (UNIQUE), marca, modelo;
--                          org_id tornou-se NOT NULL em 20260513100004, com o
--                          mesmo problema de DEFAULT que clientes — passado
--                          explicitamente. (contratos_renting.viatura_id é
--                          NOT NULL → precisa de uma viatura real). marca_id/
--                          modelo_id (20260519300007, FK opcional para
--                          viatura_marcas/viatura_modelos) são passados a par
--                          do texto: viatura_marcas exige org_id+nome e
--                          viatura_modelos exige org_id+marca_id+nome
--                          (20260519300001) — sem uma linha de catálogo válida
--                          um trigger de sincronização de marca/modelo por id
--                          (quando presente) anularia o texto e violava o
--                          NOT NULL de viaturas.marca/modelo.
--   auth.users            → id, email (padrão de rls_org_isolation.test.sql
--                          linhas 83-85). contratos_renting.created_by tem
--                          DEFAULT auth.uid(), NULL fora de sessão autenticada;
--                          o trigger AFTER INSERT de cascata (cascata_open)
--                          usa COALESCE(NEW.created_by, auth.uid()) para
--                          preencher calendario_eventos.criado_por, que é
--                          NOT NULL sem default — por isso created_by tem de
--                          vir de um utilizador real, passado explicitamente.
--   contratos_renting    (20260518000010) → cliente_id, viatura_id,
--                          data_inicio, data_fim  (org_id tem o mesmo default
--                          problemático — passado explicitamente). reserva_id
--                          tornou-se NOT NULL em 20260518000011 ("todo o
--                          contrato vem de uma reserva") → precisa de uma
--                          reserva real também.
--   reservas             (20260516000001) → org_id, data_inicio, data_fim
--                          (codigo é gerado por trigger se vier NULL/0)
--   contrato_cobrancas   (20260520000003) → org_id, contrato_id, periodo_de,
--                          periodo_ate, destinatario_id, destinatario_papel,
--                          destinatario_nome, valor_sem_iva
--
-- Sufixo aleatório evita colidir com `organizacoes.codigo` (UNIQUE) e
-- `viaturas.matricula` (UNIQUE) numa base já povoada.
--
-- O seed produz:
--   _ctx  → 1 org, 1 cliente titular, 1 cobrança 'emitida' SEM acordo
--   _ctx2 → outra cobrança 'emitida' sem acordo (mesmo titular, período
--           diferente) + um SEGUNDO cliente (outro_cliente_id), candidato a
--           assumir a dívida nos testes de cessão da Task 3
--
-- Atenção: inserir uma cobrança já em estado 'emitida' dispara
-- fn_cobranca_posta_movimento, que cria um débito em conta_movimentos. Isso é
-- esperado — a Task 3 conta apenas os movimentos de origem = 'cessao', por
-- isso não colide com este débito de origem = 'cobranca'.
do $$
declare
  v_suffix        text := replace(gen_random_uuid()::text, '-', '');
  v_org_id        uuid;
  v_marca_id      uuid;
  v_modelo_id     uuid;
  v_viatura_id    uuid;
  v_titular_id    uuid;
  v_outro_id      uuid;
  v_user_id       uuid;
  v_reserva_id    uuid;
  v_contrato_id   uuid;
  v_cobranca1_id  uuid;
  v_cobranca2_id  uuid;
begin
  insert into public.organizacoes (nome, codigo)
  values ('Org Acordos Teste ' || v_suffix, 'ap-test-' || v_suffix)
  returning id into v_org_id;

  insert into public.viatura_marcas (org_id, nome)
  values (v_org_id, 'Marca Teste ' || v_suffix)
  returning id into v_marca_id;

  insert into public.viatura_modelos (org_id, marca_id, nome)
  values (v_org_id, v_marca_id, 'Modelo Teste ' || v_suffix)
  returning id into v_modelo_id;

  insert into public.viaturas (org_id, matricula, marca_id, modelo_id, marca, modelo)
  values (v_org_id, 'AP' || upper(substr(v_suffix, 1, 8)), v_marca_id, v_modelo_id,
          'Marca Teste ' || v_suffix, 'Modelo Teste ' || v_suffix)
  returning id into v_viatura_id;

  insert into public.clientes (org_id, nome)
  values (v_org_id, 'Cliente Titular Teste ' || v_suffix)
  returning id into v_titular_id;

  insert into public.clientes (org_id, nome)
  values (v_org_id, 'Cliente Outro Teste ' || v_suffix)
  returning id into v_outro_id;

  insert into auth.users (id, email)
  values (gen_random_uuid(), 'ap-test-' || v_suffix || '@wegest-test.pt')
  returning id into v_user_id;

  insert into public.reservas (org_id, viatura_id, data_inicio, data_fim, cliente_id)
  values (v_org_id, v_viatura_id, now(), now() + interval '30 days', v_titular_id)
  returning id into v_reserva_id;

  insert into public.contratos_renting
    (org_id, reserva_id, cliente_id, viatura_id, data_inicio, data_fim, created_by)
  values
    (v_org_id, v_reserva_id, v_titular_id, v_viatura_id, now(), now() + interval '30 days', v_user_id)
  returning id into v_contrato_id;

  insert into public.contrato_cobrancas
    (org_id, contrato_id, periodo_de, periodo_ate, destinatario_id,
     destinatario_papel, destinatario_nome, valor_sem_iva, estado)
  values
    (v_org_id, v_contrato_id, current_date, current_date + 6, v_titular_id,
     'cliente', 'Cliente Titular Teste', 300, 'emitida')
  returning id into v_cobranca1_id;

  insert into public.contrato_cobrancas
    (org_id, contrato_id, periodo_de, periodo_ate, destinatario_id,
     destinatario_papel, destinatario_nome, valor_sem_iva, estado)
  values
    (v_org_id, v_contrato_id, current_date + 7, current_date + 13, v_titular_id,
     'cliente', 'Cliente Titular Teste', 300, 'emitida')
  returning id into v_cobranca2_id;

  create temporary table _ctx on commit drop as
    select v_cobranca1_id as cobranca_id, v_org_id as org_id, v_titular_id as destinatario_id;

  create temporary table _ctx2 on commit drop as
    select v_cobranca2_id as cobranca_id, v_org_id as org_id, v_titular_id as destinatario_id,
           v_outro_id as outro_cliente_id;
end $$;

-- ── Constraint: XOR do responsável ─────────────────────────────────────
prepare xor_invalido as
insert into public.acordos_pagamento
  (org_id, cobranca_id, titular_id, titular_nome,
   responsavel_cliente_id, responsavel_motorista_id, responsavel_papel, responsavel_nome,
   valor_total, frequencia)
select org_id, cobranca_id, destinatario_id, 'T', destinatario_id, null, 'motorista', 'R', 100, 'mensal'
  from _ctx;
select throws_ok('xor_invalido', null,
  'papel motorista com responsavel_cliente_id preenchido e rejeitado');

-- ── Constraint: parcela paga sem prova de liquidação ───────────────────
-- org_id omitido de propósito: exerce trg_acordos_set_org_id a derivá-lo a
-- partir da cobrança (é este acordo que a asserção final inspeciona).
insert into public.acordos_pagamento
  (cobranca_id, titular_id, titular_nome,
   responsavel_cliente_id, responsavel_papel, responsavel_nome, valor_total, frequencia)
select cobranca_id, destinatario_id, 'Titular',
       destinatario_id, 'cliente', 'Responsavel', 300, 'mensal'
  from _ctx;

prepare paga_sem_prova as
insert into public.acordo_parcelas (org_id, acordo_id, numero, data_vencimento, valor, estado)
select a.org_id, a.id, 1, current_date, 300, 'paga'
  from public.acordos_pagamento a order by a.created_at desc limit 1;
select throws_ok('paga_sem_prova', null,
  'parcela paga sem recibo_id e rejeitada pelo CHECK');

-- ── Índice: dois acordos vivos na mesma cobrança ───────────────────────
prepare segundo_acordo as
insert into public.acordos_pagamento
  (org_id, cobranca_id, titular_id, titular_nome,
   responsavel_cliente_id, responsavel_papel, responsavel_nome, valor_total, frequencia)
select org_id, cobranca_id, destinatario_id, 'Titular',
       destinatario_id, 'cliente', 'Responsavel', 300, 'mensal'
  from _ctx;
select throws_ok('segundo_acordo', null,
  'segundo acordo vivo na mesma cobranca e rejeitado pelo indice unico parcial');

-- ── org_id preenchido pelo trigger a partir da cobrança ────────────────
select is(
  (select count(*)::int from public.acordos_pagamento a join _ctx c on true
    where a.cobranca_id = c.cobranca_id and a.org_id = c.org_id),
  1, 'trigger preencheu org_id a partir da cobranca');

-- ── Trigger: titular fiscal é imutável ─────────────────────────────────
prepare titular_imutavel as
update public.acordos_pagamento
   set titular_id = (select outro_cliente_id from _ctx2)
 where cobranca_id = (select cobranca_id from _ctx);
select throws_ok('titular_imutavel', null,
  'titular_id do acordo e imutavel apos criacao e rejeitado pelo trigger');

-- ── Task 3: saldo por liquidar + acordo_criar ──────────────────────────

-- ── Saldo por liquidar ─────────────────────────────────────────────────
select is(
  public.cobranca_saldo_por_liquidar((select cobranca_id from _ctx)),
  (select valor_total from public.contrato_cobrancas where id = (select cobranca_id from _ctx)),
  'sem recibos nem NC, saldo por liquidar iguala o total');

-- ── acordo_criar rejeita soma errada ───────────────────────────────────
-- Usa _ctx2, não _ctx: _ctx já tem um acordo vivo (inserido acima, no bloco
-- "parcela paga sem prova de liquidação"), e acordo_criar verifica "já existe
-- acordo vivo" ANTES de verificar a soma das parcelas. Num cobranca com
-- acordo vivo, o erro apanhado seria sempre esse, nunca o de soma errada —
-- o que faria este teste passar pela razão errada. _ctx2 ainda não tem
-- nenhum acordo neste ponto do ficheiro.
prepare soma_errada as
select public.acordo_criar(
  (select cobranca_id from _ctx2), 'cliente', (select destinatario_id from _ctx2),
  '[{"numero":1,"data_vencimento":"2026-08-15","valor":1.00}]'::jsonb,
  'mensal', 15::smallint, 3::smallint, null);
select throws_ok('soma_errada', 'P0001',
  'acordo_criar rejeita plano cuja soma nao bate certo com o saldo');

-- ── acordo_criar rejeita cobrança já com acordo vivo ───────────────────
-- (a Task 2 já inseriu um acordo vivo sobre esta cobrança)
prepare acordo_duplicado as
select public.acordo_criar(
  (select cobranca_id from _ctx), 'cliente', (select destinatario_id from _ctx),
  '[{"numero":1,"data_vencimento":"2026-08-15","valor":300.00}]'::jsonb,
  'mensal', 15::smallint, 3::smallint, null);
select throws_ok('acordo_duplicado', 'P0001',
  'acordo_criar rejeita cobranca que ja tem acordo vivo');

-- ── Cessão: responsável ≠ titular lança DOIS movimentos ────────────────
-- `_ctx2` já foi criada pelo seed hermético da Task 2 (segunda cobrança
-- 'emitida' sem acordo + um segundo cliente para assumir a dívida). Ainda
-- não tem nenhum acordo (o teste de soma errada acima falhou antes de
-- inserir nada), por isso este é o primeiro e único acordo criado sobre ela.

select lives_ok($$
  select public.acordo_criar(
    (select cobranca_id from _ctx2), 'condutor', (select outro_cliente_id from _ctx2),
    (select jsonb_build_array(jsonb_build_object(
       'numero', 1, 'data_vencimento', '2026-08-15',
       'valor', public.cobranca_saldo_por_liquidar((select cobranca_id from _ctx2))))),
    'mensal', 15::smallint, 3::smallint, null)
$$, 'acordo_criar com responsavel diferente do titular corre sem erro');

select is(
  (select count(*)::int from public.conta_movimentos
    where origem = 'cessao' and acordo_id is not null),
  2, 'cessao lancou exactamente dois movimentos (credito + debito)');

select is(
  (select tipo from public.conta_movimentos
    where origem = 'cessao' and entidade_id = (select destinatario_id from _ctx2)),
  'credito', 'titular recebeu o CREDITO da cessao');

select is(
  (select tipo from public.conta_movimentos
    where origem = 'cessao' and entidade_id = (select outro_cliente_id from _ctx2)),
  'debito', 'responsavel recebeu o DEBITO da cessao');

select is(
  (select cessao_aplicada from public.acordos_pagamento
    where cobranca_id = (select cobranca_id from _ctx2)),
  true, 'acordo ficou com cessao_aplicada = true');

select * from finish();
rollback;
