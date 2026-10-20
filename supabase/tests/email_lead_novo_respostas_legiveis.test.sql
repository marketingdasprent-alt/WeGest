-- ============================================================
-- Email "Lead novo": respostas do formulário legíveis (pgTAP)
-- ============================================================
-- O email da Catarina Isabel Teles Matos (2026-10-20) mostrava em Observações
-- o JSON cru do formulário. Ver a migração 20261020160000.
-- ============================================================

begin;
select plan(10);

alter table public.leads_dasprent disable trigger "Lead Distância";

-- ── A conversão ─────────────────────────────────────────────────────────

create temp table respostas_catarina as select
  '{"nomeCompleto":{"label":"Nome Completo","value":"Catarina Isabel Teles Matos","type":"text"},'
  '"email":{"label":"Email Corporativo","value":"catarina@example.com","type":"email"},'
  '"telefone":{"label":"Telefone/WhatsApp","value":"+351 923351496","type":"tel"},'
  '"field_tem_formacao_tvde":{"label":"Tem Licença TVDE?","value":"Sim","type":"radio"},'
  '"zonas":{"label":"Zonas","value":["Lisboa","Porto"],"type":"checkbox"},'
  '"observacoes":{"label":"Observações (Opcional)","value":"Faço TVDE há 1 ano.\nQuero um Tesla.","type":"textarea"}}'
  ::text as json;

select is(
  public.lead_respostas_legiveis((select json from respostas_catarina)),
  E'Tem Licença TVDE?: Sim\nZonas: Lisboa, Porto\nObservações (Opcional): Faço TVDE há 1 ano. Quero um Tesla.',
  'uma resposta por linha, pela ordem do formulário, sem nome, email e telefone'
);

select is(
  public.lead_respostas_legiveis((select json from respostas_catarina), true),
  E'Zonas: Lisboa, Porto\nObservações (Opcional): Faço TVDE há 1 ano. Quero um Tesla.',
  'no email a licença TVDE sai das respostas (tem linha própria)'
);

select is(
  public.lead_respostas_legiveis('Tipo: Aluguer | Situação: Tenho licença'),
  'Observações: Tipo: Aluguer | Situação: Tenho licença',
  'texto simples (landing) fica numa linha com etiqueta'
);

select is(
  public.lead_respostas_legiveis('{não é json'),
  'Observações: {não é json',
  'texto que parece JSON mas não é não rebenta'
);

select ok(public.lead_respostas_legiveis('  ') is null, 'sem observações devolve null');

select ok(
  public.lead_respostas_legiveis(
    '{"nome":{"label":"Nome","value":"X","type":"text"},"email":{"label":"Email","value":"x@x.pt","type":"email"}}'
  ) is null,
  'só nome e email: nada a acrescentar'
);

-- ── O evento e o template ───────────────────────────────────────────────

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000004b0000', 'Org Email Lead', 'email-lead-teste');

insert into public.leads_dasprent (id, org_id, nome, email, telefone, tem_formacao_tvde, observacoes)
values ('00000000-0000-0000-0000-0000004b0001', '00000000-0000-0000-0000-0000004b0000',
        'Catarina Isabel Teles Matos', 'catarina@example.com', '+351 923351496', true,
        (select json from respostas_catarina));

select is(
  (select payload->>'observacoes' from public.domain_events
    where event_type = 'lead.novo' and entity_id = '00000000-0000-0000-0000-0000004b0001'),
  E'Zonas: Lisboa, Porto\nObservações (Opcional): Faço TVDE há 1 ano. Quero um Tesla.',
  'o evento leva as respostas legíveis, não o JSON'
);

insert into public.leads_dasprent (id, org_id, nome, email)
values ('00000000-0000-0000-0000-0000004b0002', '00000000-0000-0000-0000-0000004b0000',
        'Sem Notas', 'sem.notas@example.com');

select is(
  (select payload->>'observacoes' from public.domain_events
    where event_type = 'lead.novo' and entity_id = '00000000-0000-0000-0000-0000004b0002'),
  'Observações: sem observações',
  'sem observações o email diz isso numa linha da tabela'
);

select ok(
  (select corpo_template from public.notification_templates
    where org_id = '00000000-0000-0000-0000-0000004b0000' and codigo = 'lead.novo' and canal = 'email')
  ~ E'Formulário: \\{\\{formulario\\}\\}\\n\\{\\{observacoes\\}\\}$',
  'as respostas entram na tabela logo a seguir a Formulário'
);

select ok(
  (select assunto || corpo_template from public.notification_templates
    where org_id = '00000000-0000-0000-0000-0000004b0000' and codigo = 'lead.novo' and canal = 'email')
  !~ '[—–]',
  'o modelo de email continua sem travessões'
);

select * from finish();
rollback;
