-- O mesmo contacto a enviar o formulário outra vez criava outro lead (Nara
-- Lamberty, 2026-10-20, às 09:42 e às 09:44), e cada um disparava o webhook e
-- o aviso à equipa. Nos últimos 180 dias, 57 de 408 leads repetiam o contacto.
-- O formulário não consegue verificar isto: o anon não lê leads_dasprent.
--
-- Agora um envio de formulário cujo email ou telefone já deu lead nessa org
-- nas últimas 24 h junta-se a esse lead: as respostas novas vão para as notas
-- dos gestores e não nasce lead novo. 24 h porque o CRM ordena por created_at:
-- um reenvio colado a um lead antigo ficava enterrado na lista.
-- Só envios de formulário (anon, ou com formulario_id): importações e leads
-- criados à mão pela equipa entram como sempre.

create or replace function public.lead_reenvio_junta_ao_existente()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email     text := nullif(lower(btrim(new.email)), '');
  v_telefone  text := right(regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g'), 9);
  v_existente uuid;
  v_respostas jsonb;
  v_detalhe   text;
begin
  if coalesce(auth.role(), '') <> 'anon' and new.formulario_id is null then
    return new;
  end if;

  if length(v_telefone) <> 9 then
    v_telefone := null;
  end if;
  if v_email is null and v_telefone is null then
    return new;
  end if;

  -- Dois cliques seguidos chegam em paralelo e nenhum veria o outro. Ordem
  -- fixa (email, depois telefone) para não haver deadlock.
  if v_email is not null then
    perform pg_advisory_xact_lock(hashtextextended('lead:' || new.org_id || ':' || v_email, 0));
  end if;
  if v_telefone is not null then
    perform pg_advisory_xact_lock(hashtextextended('lead:' || new.org_id || ':' || v_telefone, 0));
  end if;

  select l.id
    into v_existente
    from public.leads_dasprent l
   where l.org_id = new.org_id
     and l.created_at > now() - interval '24 hours'
     and (
       (v_email is not null and lower(btrim(l.email)) = v_email)
       or (v_telefone is not null
           and right(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g'), 9) = v_telefone)
     )
   order by l.created_at desc
   limit 1;

  if v_existente is null then
    return new;
  end if;

  -- O formulário público grava as respostas em JSON; a landing grava texto.
  begin
    v_respostas := new.observacoes::jsonb;
  exception when others then
    v_respostas := null;
  end;

  if jsonb_typeof(v_respostas) = 'object' then
    select string_agg(coalesce(c.valor ->> 'label', c.chave) || ': ' || btrim(c.valor ->> 'value'), E'\n')
      into v_detalhe
      from jsonb_each(v_respostas) as c(chave, valor)
     where jsonb_typeof(c.valor) = 'object'
       and nullif(btrim(c.valor ->> 'value'), '') is not null
       and coalesce(c.valor ->> 'type', '') not in ('email', 'tel')
       and c.chave not ilike 'nome%';
  else
    v_detalhe := nullif(btrim(new.observacoes), '');
  end if;

  update public.leads_dasprent l
     set observacoes_gestores = concat_ws(
           E'\n\n',
           nullif(btrim(l.observacoes_gestores), ''),
           concat_ws(
             E'\n',
             'Voltou a enviar o formulário a '
               || to_char(now() at time zone 'Europe/Lisbon', 'DD/MM/YYYY "às" HH24:MI') || '.',
             v_detalhe
           )
         ),
         campaign_tags = array(
           select distinct t
             from unnest(coalesce(l.campaign_tags, '{}') || coalesce(new.campaign_tags, '{}')) as t
            order by t
         ),
         updated_at = now()
   where l.id = v_existente;

  -- Sem linha nova: nem webhook nem aviso de lead novo em duplicado.
  return null;
end;
$function$;

comment on function public.lead_reenvio_junta_ao_existente() is
  'Envio de formulário com email ou telefone que já deu lead na org nas últimas 24 h junta-se a esse lead em vez de criar outro. Ver 20261020150000.';

revoke all on function public.lead_reenvio_junta_ao_existente() from public, anon, authenticated;

drop trigger if exists lead_reenvio_junta_ao_existente on public.leads_dasprent;
create trigger lead_reenvio_junta_ao_existente
  before insert on public.leads_dasprent
  for each row execute function public.lead_reenvio_junta_ao_existente();

notify pgrst, 'reload schema';
