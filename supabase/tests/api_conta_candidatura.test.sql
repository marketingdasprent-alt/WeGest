-- ============================================================
-- A conta do motorista gere a candidatura TVDE pela API
-- ============================================================
-- Rascunho por passos, 8 documentos, submissão e estado. Isolamento entre
-- contas e organizações; caminhos de ficheiros só da própria conta.
-- NIFs de teste com checksum válido; datas relativas a now().
-- ============================================================
begin;
select plan(47);

-- Bootstrap antes das organizações: consome a vaga do primeiro utilizador.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000c0fff', 'bootstrap@candconta.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000c0fa0', 'Org Cand Conta A', 'candconta-a'),
  ('00000000-0000-0000-0000-0000000c0fb0', 'Org Cand Conta B', 'candconta-b');
insert into public.api_chaves (id, org_id, nome, escopo, permissoes) values
  ('00000000-0000-0000-0000-0000000c0f91', '00000000-0000-0000-0000-0000000c0fa0', 'Site A', 'rent_a_car',
   '{conta:read}');

-- 1 e 2 motoristas da A; 3 motorista só da B; 4 colaborador da A; 5 e 6 motoristas da A.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0f01', 'u1@candconta.pt'),
  ('00000000-0000-0000-0000-0000000c0f02', 'u2@candconta.pt'),
  ('00000000-0000-0000-0000-0000000c0f03', 'u3@candconta.pt'),
  ('00000000-0000-0000-0000-0000000c0f04', 'colab@candconta.pt'),
  ('00000000-0000-0000-0000-0000000c0f05', 'u5@candconta.pt'),
  ('00000000-0000-0000-0000-0000000c0f06', 'u6@candconta.pt');
update public.profiles set tipo_utilizador = 'motorista'
 where id in ('00000000-0000-0000-0000-0000000c0f01', '00000000-0000-0000-0000-0000000c0f02',
              '00000000-0000-0000-0000-0000000c0f03', '00000000-0000-0000-0000-0000000c0f05',
              '00000000-0000-0000-0000-0000000c0f06');
update public.profiles set tipo_utilizador = 'colaborador' where id = '00000000-0000-0000-0000-0000000c0f04';
insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000c0f01', '00000000-0000-0000-0000-0000000c0fa0', false),
  ('00000000-0000-0000-0000-0000000c0f02', '00000000-0000-0000-0000-0000000c0fa0', false),
  ('00000000-0000-0000-0000-0000000c0f03', '00000000-0000-0000-0000-0000000c0fb0', false),
  ('00000000-0000-0000-0000-0000000c0f04', '00000000-0000-0000-0000-0000000c0fa0', false),
  ('00000000-0000-0000-0000-0000000c0f05', '00000000-0000-0000-0000-0000000c0fa0', false),
  ('00000000-0000-0000-0000-0000000c0f06', '00000000-0000-0000-0000-0000000c0fa0', false)
  on conflict (user_id, org_id) do nothing;

-- Atalhos: a org A e a chave A fixas; o utilizador vai por argumento.
create function pg_temp.ver(p_user uuid) returns jsonb language sql as $$
  select public.api_conta_candidatura('00000000-0000-0000-0000-0000000c0fa0', p_user);
$$;
create function pg_temp.guardar(p_user uuid, p_pedido jsonb) returns jsonb language sql as $$
  select public.api_conta_candidatura_guardar('00000000-0000-0000-0000-0000000c0fa0',
    '00000000-0000-0000-0000-0000000c0f91', p_user, p_pedido);
$$;
create function pg_temp.doc(p_user uuid, p_tipo text, p_caminho text) returns jsonb language sql as $$
  select public.api_conta_candidatura_documento('00000000-0000-0000-0000-0000000c0fa0', p_user, p_tipo, p_caminho);
$$;
create function pg_temp.submeter(p_user uuid) returns jsonb language sql as $$
  select public.api_conta_candidatura_submeter('00000000-0000-0000-0000-0000000c0fa0', p_user);
$$;
-- Caminho válido da própria conta.
create function pg_temp.cam(p_user uuid, p_tipo text) returns text language sql as $$
  select p_user::text || '/candidatura/' || p_tipo || '/ficheiro.pdf';
$$;
-- Anexa os documentos pedidos (lista de tipos).
create function pg_temp.anexar(p_user uuid, p_tipos text[]) returns void language plpgsql as $$
declare t text;
begin
  foreach t in array p_tipos loop
    perform pg_temp.doc(p_user, t, pg_temp.cam(p_user, t));
  end loop;
end $$;

create temp table dados as select jsonb_build_object(
  'nome', 'Motorista Um', 'telefone', '+351912345678', 'nif', '210000015',
  'morada', 'Rua Direita 1', 'codigo_postal', '2400-001', 'cidade', 'Leiria',
  'documento', jsonb_build_object('tipo', 'cc', 'numero', '12345678', 'validade', (current_date + 365)::text),
  'carta_conducao', jsonb_build_object('numero', 'L-123456', 'categorias', jsonb_build_array('B'),
                                       'validade', (current_date + 365)::text),
  'licenca_tvde', jsonb_build_object('numero', 'TVDE-1', 'validade', (current_date + 365)::text),
  'em_formacao_tvde', false,
  'iban', 'PT50000201231234567890154',
  'consentimento', jsonb_build_object('versao', '2026-10', 'aceite_em', now())) as j;
grant select on dados to public;

-- ── 1) conta e estado vazio ─────────────────────────────────────────────────
select is(pg_temp.ver('00000000-0000-0000-0000-0000000c0f01'), '{"candidatura": null}'::jsonb,
  'sem candidatura: candidatura null');
select is(pg_temp.ver('00000000-0000-0000-0000-0000000c0f04')->'erro'->>'codigo', 'CONTA_INVALIDA',
  'conta de colaborador recusada');
select is(public.api_conta_candidatura('00000000-0000-0000-0000-0000000c0fa0',
            '00000000-0000-0000-0000-0000000c0f03')->'erro'->>'codigo', 'CONTA_INVALIDA',
  'motorista só da organização B não entra na A');
select is(public.api_conta_candidatura('00000000-0000-0000-0000-0000000c0fb0',
            '00000000-0000-0000-0000-0000000c0f01')->'erro'->>'codigo', 'CONTA_INVALIDA',
  'motorista da A não entra pela chave da B');
select is(pg_temp.ver('00000000-0000-0000-0000-0000000c09ff')->'erro'->>'codigo', 'CONTA_INVALIDA',
  'conta inexistente');

-- ── 2) validações do rascunho ───────────────────────────────────────────────
select is(pg_temp.guardar('00000000-0000-0000-0000-0000000c0f01', '{"nif": "210000016"}')->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'NIF com checksum errado');
select is(pg_temp.guardar('00000000-0000-0000-0000-0000000c0f01', '{"iban": "PT50000201231234567890155"}')->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'IBAN com checksum errado');
select is(pg_temp.guardar('00000000-0000-0000-0000-0000000c0f01', '{"email": "outro@candconta.pt"}')->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'email diferente do da conta');
select is(pg_temp.guardar('00000000-0000-0000-0000-0000000c0f01',
            '{"carta_conducao": {"categorias": ["Z"]}}')->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'categoria de carta inválida');
select is(pg_temp.guardar('00000000-0000-0000-0000-0000000c0f01',
            '{"modelo_pretendido_id": "00000000-0000-0000-0000-0000000c0f77"}')->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'modelo que não é um modelo TVDE publicado');
select is((select count(*)::int from public.motorista_candidaturas where org_id = '00000000-0000-0000-0000-0000000c0fa0'), 0,
  'nenhuma recusa gravou candidatura');

-- ── 3) rascunho por passos ──────────────────────────────────────────────────
create temp table p1 as select pg_temp.guardar('00000000-0000-0000-0000-0000000c0f01',
  '{"nome": "Motorista Um", "nif": "210000015", "telefone": "+351912345678",
    "status": "submetido", "user_id": "00000000-0000-0000-0000-0000000c0f02",
    "org_id": "00000000-0000-0000-0000-0000000c0fb0"}') as r;
grant select on p1 to public;
select ok((select r->'candidatura'->>'estado' = 'rascunho' and r->'candidatura'->'dados'->>'nif' = '210000015' from p1),
  'primeiro passo cria o rascunho');
select ok((select c.user_id = '00000000-0000-0000-0000-0000000c0f01' and c.org_id = '00000000-0000-0000-0000-0000000c0fa0'
                  and c.origem = 'site' and c.api_chave_id = '00000000-0000-0000-0000-0000000c0f91'
                  and c.status = 'rascunho'
             from public.motorista_candidaturas c where c.id = (select (r->'candidatura'->>'id')::uuid from p1)),
  'status, user_id e org_id do pedido são ignorados');
select is((select count(*)::int from public.notificacoes where tipo = 'motorista_pendente'
            and candidatura_id = (select (r->'candidatura'->>'id')::uuid from p1)), 0,
  'o rascunho não avisa a equipa');
select is(pg_temp.guardar('00000000-0000-0000-0000-0000000c0f01', '{"cidade": "Leiria"}')->'candidatura'->'dados'->>'nif',
  '210000015', 'um passo seguinte não apaga os campos que não vêm');
select is(pg_temp.guardar('00000000-0000-0000-0000-0000000c0f02', '{"nif": "210000015"}')->'erro'->>'codigo',
  'CANDIDATURA_EXISTENTE', 'outro NIF em curso noutra conta recusado');
select ok(not (pg_temp.ver('00000000-0000-0000-0000-0000000c0f01')->'candidatura'->>'pode_submeter')::boolean,
  'rascunho incompleto não pode submeter');

-- ── 4) resto dos dados, sem documentos ──────────────────────────────────────
select ok(pg_temp.guardar('00000000-0000-0000-0000-0000000c0f01', (select j from dados))
            ->'candidatura'->'dados'->'carta_conducao'->'categorias' = '["B"]'::jsonb,
  'dados completos guardados');
select ok((pg_temp.ver('00000000-0000-0000-0000-0000000c0f01')->'candidatura'->'em_falta') @> '["documento_frente", "licenca_tvde", "comprovativo_iban"]'::jsonb
          and jsonb_array_length(pg_temp.ver('00000000-0000-0000-0000-0000000c0f01')->'candidatura'->'em_falta') = 8,
  'faltam os 8 documentos (licença incluída, sem formação)');
select is(pg_temp.submeter('00000000-0000-0000-0000-0000000c0f01')->'erro'->>'codigo', 'CANDIDATURA_INCOMPLETA',
  'submeter sem documentos é recusado');
select is(jsonb_array_length(pg_temp.submeter('00000000-0000-0000-0000-0000000c0f01')->'erro'->'em_falta'->'documentos'), 8,
  'o erro lista os documentos em falta');

-- ── 5) caminhos de documentos ───────────────────────────────────────────────
select is(pg_temp.doc('00000000-0000-0000-0000-0000000c0f01', 'carta_frente',
            '00000000-0000-0000-0000-0000000c0f02/candidatura/carta_frente/ficheiro.pdf')->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'caminho de outra conta');
select is(pg_temp.doc('00000000-0000-0000-0000-0000000c0f01', 'carta_frente',
            '00000000-0000-0000-0000-0000000c0f01/candidatura/carta_frente/../../x/ficheiro.pdf')->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'caminho com ..');
select is(pg_temp.doc('00000000-0000-0000-0000-0000000c0f01', 'carta_frente',
            '00000000-0000-0000-0000-0000000c0f01/candidatura/carta_frente/sub/ficheiro.pdf')->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'caminho com barra a mais');
select is(pg_temp.doc('00000000-0000-0000-0000-0000000c0f01', 'carta_frente',
            '00000000-0000-0000-0000-0000000c0f01/candidatura/carta_frente/virus.exe')->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'extensão não permitida');
select is(pg_temp.doc('00000000-0000-0000-0000-0000000c0f01', 'carta_frente',
            '00000000-0000-0000-0000-0000000c0f01/candidatura/carta_verso/ficheiro.pdf')->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'caminho de outro tipo de documento');
select is(pg_temp.doc('00000000-0000-0000-0000-0000000c0f01', 'passaporte_x',
            '00000000-0000-0000-0000-0000000c0f01/candidatura/passaporte_x/ficheiro.pdf')->'erro'->>'codigo',
  'PARAMETRO_INVALIDO', 'tipo de documento desconhecido');
select is(pg_temp.doc('00000000-0000-0000-0000-0000000c0f02', 'carta_frente',
            pg_temp.cam('00000000-0000-0000-0000-0000000c0f02', 'carta_frente'))->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'conta sem candidatura não anexa documentos');

create temp table d1 as select pg_temp.doc('00000000-0000-0000-0000-0000000c0f01', 'carta_frente',
  pg_temp.cam('00000000-0000-0000-0000-0000000c0f01', 'carta_frente')) as r;
grant select on d1 to public;
select ok((select (r->'candidatura'->'documentos'->'carta_frente'->>'recebido')::boolean
                  and r::text not like '%/candidatura/%' from d1),
  'documento recebido e o caminho nunca sai na resposta');
select is((select carta_ficheiro_url from public.motorista_candidaturas
            where user_id = '00000000-0000-0000-0000-0000000c0f01'),
  '00000000-0000-0000-0000-0000000c0f01/candidatura/carta_frente/ficheiro.pdf', 'o caminho ficou na coluna certa');
select is(pg_temp.doc('00000000-0000-0000-0000-0000000c0f01', 'carta_frente', null)->>'caminho_removido',
  '00000000-0000-0000-0000-0000000c0f01/candidatura/carta_frente/ficheiro.pdf',
  'apagar a referência devolve o caminho antigo para o servidor limpar o storage');
select ok(not (pg_temp.ver('00000000-0000-0000-0000-0000000c0f01')->'candidatura'->'documentos'->'carta_frente'->>'recebido')::boolean,
  'depois de apagar o documento volta a faltar');

-- ── 6) submeter ─────────────────────────────────────────────────────────────
select pg_temp.anexar('00000000-0000-0000-0000-0000000c0f01',
  array['documento_frente', 'documento_verso', 'carta_frente', 'carta_verso', 'licenca_tvde',
        'registo_criminal', 'comprovativo_morada', 'comprovativo_iban']);
select ok((pg_temp.ver('00000000-0000-0000-0000-0000000c0f01')->'candidatura'->>'pode_submeter')::boolean,
  'com tudo preenchido pode submeter');
create temp table s1 as select pg_temp.submeter('00000000-0000-0000-0000-0000000c0f01') as r;
grant select on s1 to public;
select ok((select r->'candidatura'->>'estado' = 'submetido' and r->'candidatura'->>'submetida_em' is not null from s1),
  'submeter passa a submetido com data de submissão');
select is((select count(*)::int from public.notificacoes where tipo = 'motorista_pendente'
            and candidatura_id = (select (r->'candidatura'->>'id')::uuid from s1)), 1,
  'submeter avisa a equipa (motorista pendente)');
select is(pg_temp.submeter('00000000-0000-0000-0000-0000000c0f01')->'candidatura'->>'estado', 'submetido',
  'submeter outra vez é idempotente');
select is((select count(*)::int from public.notificacoes where tipo = 'motorista_pendente'
            and candidatura_id = (select (r->'candidatura'->>'id')::uuid from s1)), 1,
  'a repetição não duplica o aviso');
select is(pg_temp.guardar('00000000-0000-0000-0000-0000000c0f01', '{"cidade": "Porto"}')->'erro'->>'codigo',
  'CANDIDATURA_NAO_EDITAVEL', 'depois de submetida já não se edita');
select is(pg_temp.doc('00000000-0000-0000-0000-0000000c0f01', 'registo_criminal', null)->'erro'->>'codigo',
  'CANDIDATURA_NAO_EDITAVEL', 'depois de submetida os documentos já não mudam');

-- ── 7) isolamento ───────────────────────────────────────────────────────────
select is(pg_temp.ver('00000000-0000-0000-0000-0000000c0f02'), '{"candidatura": null}'::jsonb,
  'outra conta da mesma organização não vê a candidatura');
select is(public.api_conta_candidatura('00000000-0000-0000-0000-0000000c0fa0',
            '00000000-0000-0000-0000-0000000c0f03')->'erro'->>'codigo', 'CONTA_INVALIDA',
  'conta da organização B não vê nada da A');

-- ── 8) em formação dispensa a licença ───────────────────────────────────────
select pg_temp.guardar('00000000-0000-0000-0000-0000000c0f05',
  (select j || '{"nome": "Cinco", "nif": "210000023"}'::jsonb from dados));
select pg_temp.anexar('00000000-0000-0000-0000-0000000c0f05',
  array['documento_frente', 'documento_verso', 'carta_frente', 'carta_verso',
        'registo_criminal', 'comprovativo_morada', 'comprovativo_iban']);
select is(pg_temp.ver('00000000-0000-0000-0000-0000000c0f05')->'candidatura'->'em_falta', '["licenca_tvde"]'::jsonb,
  'sem formação a licença TVDE é obrigatória');
select ok((pg_temp.guardar('00000000-0000-0000-0000-0000000c0f05',
             '{"em_formacao_tvde": true, "licenca_tvde": null}')->'candidatura'->>'pode_submeter')::boolean,
  'em formação dispensa a licença');
select is(pg_temp.submeter('00000000-0000-0000-0000-0000000c0f05')->'candidatura'->>'estado', 'submetido',
  'e submete');

-- ── 9) consentimento em falta bloqueia ──────────────────────────────────────
select pg_temp.guardar('00000000-0000-0000-0000-0000000c0f06',
  (select (j - 'consentimento') || '{"nome": "Seis", "nif": "210000031"}'::jsonb from dados));
select pg_temp.anexar('00000000-0000-0000-0000-0000000c0f06',
  array['documento_frente', 'documento_verso', 'carta_frente', 'carta_verso', 'licenca_tvde',
        'registo_criminal', 'comprovativo_morada', 'comprovativo_iban']);
select is(pg_temp.submeter('00000000-0000-0000-0000-0000000c0f06')->'erro'->'em_falta'->'campos', '["consentimento"]'::jsonb,
  'sem consentimento gravado não submete');

-- ── 10) privilégios ─────────────────────────────────────────────────────────
select ok(not exists (
  select 1 from unnest(array[
    'public.api_conta_candidatura(uuid,uuid)',
    'public.api_conta_candidatura_guardar(uuid,uuid,uuid,jsonb)',
    'public.api_conta_candidatura_documento(uuid,uuid,text,text)',
    'public.api_conta_candidatura_submeter(uuid,uuid)']) f
   where has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')),
  'anon e authenticated não executam nenhuma');
select ok((select bool_and(has_function_privilege('service_role', f, 'EXECUTE')) from unnest(array[
    'public.api_conta_candidatura(uuid,uuid)',
    'public.api_conta_candidatura_guardar(uuid,uuid,uuid,jsonb)',
    'public.api_conta_candidatura_documento(uuid,uuid,text,text)',
    'public.api_conta_candidatura_submeter(uuid,uuid)']) f),
  'service_role executa todas');

select * from finish();
rollback;
