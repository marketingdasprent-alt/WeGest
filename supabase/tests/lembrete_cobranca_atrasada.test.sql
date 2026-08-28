-- ============================================================
-- Lembrete de cobrança em atraso ao devedor (I3) — versão simples
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- useContasAReceber já calcula corretamente saldo real e dias em aberto
-- (usado hoje só no Dashboard interno) — mas nunca é enviado qualquer
-- contacto automático a quem deve. Esta versão (âmbito reduzido,
-- combinado explicitamente) manda UM aviso único quando uma cobrança
-- passa 30 dias em aberto — sem repetir aos 45/60 dias.
--
-- Bypassa deliberadamente o motor de automação novo (domain_events/
-- automation_rules): o destinatário aqui é um cliente/motorista que pode
-- não ter conta auth.users, e notifications/notification_queue exigem
-- destinatario_user_id NOT NULL. Reaproveita antes o padrão mais antigo,
-- já provado em recibo_anulado: SQL function -> net.http_post direto para
-- uma edge function dedicada.
-- ============================================================

begin;
select plan(7);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f0000', 'Org Cobranca Atrasada', 'cobranca-atrasada-f');

insert into public.clientes (id, org_id, nome, email) values
  ('00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0000', 'Devedor Teste', 'devedor@cobranca-atrasada-f.pt');

insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-00000081e0f1', '00000000-0000-0000-0000-0000000f0000', 'FF-11-FF', 'Toyota', 'Corolla');

insert into public.contratos_renting (id, org_id, cliente_id, viatura_id, matricula, data_inicio, data_fim, estado_operacional, regime, is_longa_duracao) values
  ('00000000-0000-0000-0000-000000c71e0f', '00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-00000081e0f1', 'FF-11-FF', now() - interval '90 days', now() + interval '90 days', 'em_curso', 'rent_a_car', false);

-- Cob 1: emitida há 45 dias, por pagar, sem recibo/NC — deve avisar.
insert into public.contrato_cobrancas (id, org_id, contrato_id, periodo_de, periodo_ate, destinatario_id, destinatario_papel, destinatario_nome, valor_sem_iva, estado, emitida_em) values
  ('00000000-0000-0000-0000-000000cb1e01', '00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-000000c71e0f', current_date - 45, current_date - 39, '00000000-0000-0000-0000-0000000f0c01', 'cliente', 'Devedor Teste', 100.00, 'emitida', now() - interval '45 days');

-- Cob 2: emitida há 45 dias, mas já totalmente paga — NÃO deve avisar.
insert into public.contrato_cobrancas (id, org_id, contrato_id, periodo_de, periodo_ate, destinatario_id, destinatario_papel, destinatario_nome, valor_sem_iva, estado, emitida_em) values
  ('00000000-0000-0000-0000-000000cb2e02', '00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-000000c71e0f', current_date - 45, current_date - 39, '00000000-0000-0000-0000-0000000f0c01', 'cliente', 'Devedor Teste', 100.00, 'emitida', now() - interval '45 days');

insert into public.recibos (org_id, referencia, valor, estado) values
  ('00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-000000cb2e02', 123.00, 'ativo');

-- Cob 3: emitida há só 20 dias — ainda não passou o prazo — NÃO deve avisar.
insert into public.contrato_cobrancas (id, org_id, contrato_id, periodo_de, periodo_ate, destinatario_id, destinatario_papel, destinatario_nome, valor_sem_iva, estado, emitida_em) values
  ('00000000-0000-0000-0000-000000cb3e03', '00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-000000c71e0f', current_date - 20, current_date - 14, '00000000-0000-0000-0000-0000000f0c01', 'cliente', 'Devedor Teste', 100.00, 'emitida', now() - interval '20 days');

-- Cob 4: emitida há 45 dias mas já com o aviso anteriormente enviado — NÃO repete.
insert into public.contrato_cobrancas (id, org_id, contrato_id, periodo_de, periodo_ate, destinatario_id, destinatario_papel, destinatario_nome, valor_sem_iva, estado, emitida_em, lembrete_atraso_enviado_em) values
  ('00000000-0000-0000-0000-000000cb4e04', '00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-000000c71e0f', current_date - 45, current_date - 39, '00000000-0000-0000-0000-0000000f0c01', 'cliente', 'Devedor Teste', 100.00, 'emitida', now() - interval '45 days', now() - interval '10 days');

-- Cob 5: emitida há 45 dias, creditada por nota de crédito que zera o saldo — NÃO deve avisar.
insert into public.contrato_cobrancas (id, org_id, contrato_id, periodo_de, periodo_ate, destinatario_id, destinatario_papel, destinatario_nome, valor_sem_iva, estado, emitida_em) values
  ('00000000-0000-0000-0000-000000cb5e05', '00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-000000c71e0f', current_date - 45, current_date - 39, '00000000-0000-0000-0000-0000000f0c01', 'cliente', 'Devedor Teste', 100.00, 'emitida', now() - interval '45 days');

insert into public.notas_credito (org_id, cobranca_id, entidade_id, valor, motivo, estado) values
  ('00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-000000cb5e05', '00000000-0000-0000-0000-0000000f0c01', 123.00, 'Anulação de teste', 'ativo');

select public.emit_lembretes_cobranca_atrasada();

-- 1. Cob 1 (por pagar, >30 dias, sem aviso anterior) recebe o aviso.
select is(
  (select (lembrete_atraso_enviado_em is not null) from public.contrato_cobrancas where id = '00000000-0000-0000-0000-000000cb1e01'),
  true,
  'cobrança em atraso real (>30 dias, saldo por pagar) fica marcada como avisada'
);

-- 2. Cob 2 (já paga) NÃO recebe aviso.
select is(
  (select lembrete_atraso_enviado_em from public.contrato_cobrancas where id = '00000000-0000-0000-0000-000000cb2e02'),
  null::timestamptz,
  'cobrança já totalmente paga não é avisada (saldo zero)'
);

-- 3. Cob 3 (só 20 dias) NÃO recebe aviso.
select is(
  (select lembrete_atraso_enviado_em from public.contrato_cobrancas where id = '00000000-0000-0000-0000-000000cb3e03'),
  null::timestamptz,
  'cobrança com menos de 30 dias em aberto não é avisada'
);

-- 4. Cob 4 (aviso já enviado antes) mantém o timestamp original, não duplica.
select is(
  (select lembrete_atraso_enviado_em from public.contrato_cobrancas where id = '00000000-0000-0000-0000-000000cb4e04') < now() - interval '9 days',
  true,
  'cobrança já avisada anteriormente não é avisada outra vez (timestamp não avança)'
);

-- 5. Cob 5 (creditada por completo via NC) NÃO recebe aviso.
select is(
  (select lembrete_atraso_enviado_em from public.contrato_cobrancas where id = '00000000-0000-0000-0000-000000cb5e05'),
  null::timestamptz,
  'cobrança totalmente creditada por nota de crédito não é avisada'
);

-- 6. Só a Cob 1 foi avisada no total (as outras 4 continuam null).
select is(
  (select count(*)::int from public.contrato_cobrancas where org_id = '00000000-0000-0000-0000-0000000f0000' and lembrete_atraso_enviado_em is not null and lembrete_atraso_enviado_em > now() - interval '1 minute'),
  1,
  'exatamente 1 cobrança nova foi avisada nesta corrida'
);

-- 7. Correr outra vez não avisa mais ninguém (Cob 1 já fica marcada).
select public.emit_lembretes_cobranca_atrasada();

select is(
  (select count(*)::int from public.contrato_cobrancas where org_id = '00000000-0000-0000-0000-0000000f0000' and lembrete_atraso_enviado_em is not null),
  2,
  'correr outra vez só soma a cobrança já pré-marcada (cb4) mais a nova (cb1) — não duplica nem adiciona mais'
);

select * from finish();
rollback;
