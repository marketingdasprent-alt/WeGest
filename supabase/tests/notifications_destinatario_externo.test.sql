begin;
select plan(6);

-- ============================================================================
-- notifications ganha um destinatário alternativo (Fase 2 da acção de email)
-- ============================================================================

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f0000', 'Org Destinatario Externo', 'dest-externo-a');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001', 'interno@dest-externo.pt');

-- 1. destinatario_user_id deixou de ser NOT NULL.
select ok(
  not attnotnull,
  'destinatario_user_id passa a opcional'
) from pg_attribute
where attrelid = 'public.notifications'::regclass
  and attname = 'destinatario_user_id';

-- 2. A coluna nova existe e é nullable.
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications'
      and column_name = 'destinatario_email_externo' and is_nullable = 'YES'
  ),
  'destinatario_email_externo existe e é opcional'
);

-- 3. A CHECK recusa uma linha sem nenhum dos dois.
select throws_ok($$
  insert into public.notifications (org_id, template_codigo, titulo, payload)
  values ('00000000-0000-0000-0000-0000000f0000', 'x', 'x', '{}'::jsonb)
$$, '23514', null, 'a CHECK recusa uma linha sem destinatário nenhum');

-- 4. A CHECK recusa uma linha com os dois ao mesmo tempo.
select throws_ok($$
  insert into public.notifications (org_id, destinatario_user_id, destinatario_email_externo, template_codigo, titulo, payload)
  values ('00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-0000000f0001',
          'a@b.pt', 'x', 'x', '{}'::jsonb)
$$, '23514', null, 'a CHECK recusa uma linha com os dois destinatários');

-- 5. Uma linha só com o interno continua a funcionar (comportamento antigo).
select lives_ok($$
  insert into public.notifications (id, org_id, destinatario_user_id, template_codigo, titulo, payload)
  values ('00000000-0000-0000-0000-0000001f0001', '00000000-0000-0000-0000-0000000f0000',
          '00000000-0000-0000-0000-0000000f0001', 'x', 'x', '{}'::jsonb)
$$, 'uma linha só com destinatario_user_id continua a ser aceite');

-- 6. Uma linha só com o externo é aceite.
select lives_ok($$
  insert into public.notifications (id, org_id, destinatario_email_externo, template_codigo, titulo, payload)
  values ('00000000-0000-0000-0000-0000001f0002', '00000000-0000-0000-0000-0000000f0000',
          'fornecedor@fora.pt', 'x', 'x', '{}'::jsonb)
$$, 'uma linha só com destinatario_email_externo é aceite');

select * from finish();
rollback;
