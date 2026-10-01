-- ============================================================
-- Modelos de email em linhas e sem travessões — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Ver a migração 20261001140000.
--   (1) uma organização nova recebe os modelos já reescritos (o gatilho
--       zz_textos_padrao_email corre depois das sementes);
--   (2) nenhum modelo tem travessão;
--   (3) os modelos trazem os campos em linhas "Etiqueta: valor";
--   (4) o resumo diário usa {{lista}} escapado, não {{{lista}}};
--   (5) as alterações saem uma por linha, com estados legíveis.
-- ============================================================

begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000001b00ff', 'bootstrap@sem-travessoes.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000001b0000', 'Org Sem Travessoes', 'st-a');

select cmp_ok(
  (select count(*)::int from public.notification_templates
    where org_id = '00000000-0000-0000-0000-0000001b0000' and canal = 'email'),
  '>', 0,
  'a organização nova recebe modelos de email'
);

select is(
  (select count(*)::int from public.notification_templates
    where org_id = '00000000-0000-0000-0000-0000001b0000'
      and (assunto ~ '[—–]' or corpo_template ~ '[—–]')),
  0,
  'nenhum modelo da organização nova tem travessão'
);

select ok(
  (select corpo_template from public.notification_templates
    where org_id = '00000000-0000-0000-0000-0000001b0000'
      and codigo = 'contrato_renting.sem_checkin' and canal = 'email')
  like E'%\nContrato: {{codigo}}\nCliente: {{cliente_nome}}\nViatura: {{matricula}}%',
  'os dados vêm um por linha, "Etiqueta: valor"'
);

select is(
  (select assunto from public.notification_templates
    where org_id = '00000000-0000-0000-0000-0000001b0000'
      and codigo = 'digest.resumo_diario' and canal = 'email'),
  'Resumo diário: {{total}} aviso(s) novo(s)',
  'o assunto do resumo diário perdeu o travessão'
);

select ok(
  (select corpo_template from public.notification_templates
    where org_id = '00000000-0000-0000-0000-0000001b0000'
      and codigo = 'digest.resumo_diario' and canal = 'email')
  like '%{{lista}}%'
  and (select corpo_template from public.notification_templates
        where org_id = '00000000-0000-0000-0000-0000001b0000'
          and codigo = 'digest.resumo_diario' and canal = 'email')
  not like '%{{{lista}}}%',
  'o resumo diário usa {{lista}}, que o envio escapa'
);

select is(
  public.alteracoes_em_linhas(
    '[{"campo":"titular","antes":"Luiz","depois":"sem titular"},
      {"campo":"estado","antes":"em_uso","depois":"disponivel"},
      {"campo":"data de devolução","antes":"—","depois":"23/09/2026"}]'::jsonb,
    'antes'),
  E'Titular: Luiz\nEstado: Em uso\nData de devolução: sem dados',
  'o antes sai um campo por linha, com estado legível e sem travessão'
);

select is(
  public.alteracoes_numa_linha(
    '[{"campo":"estado","antes":"em_uso","depois":"disponivel"}]'::jsonb),
  'Estado: Em uso → Disponível',
  'a versão de uma linha (sino) também sem travessão'
);

select * from finish();
rollback;
