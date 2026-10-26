-- O agrupamento de notificações corria como dono da base (SECURITY DEFINER): um
-- INSERT que encontrasse uma linha parecida fazia UPDATE nela e devolvia NULL,
-- e o INSERT nunca chegava à RLS. Um utilizador conseguia assim escrever texto
-- e link numa notificação de outra pessoa — e de outra organização.
--
-- Quem insere notificações legitimamente são funções do servidor (correm como
-- dono) e a service role; a app só lê. Passa a SECURITY INVOKER e, vindo de
-- authenticated/anon, não agrupa: o INSERT segue e a RLS decide (recusa).
-- O resto do corpo é igual ao de 20260828160000.

CREATE OR REPLACE FUNCTION public.fn_notificacoes_agrupar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_id   uuid;
  v_item jsonb;
begin
  v_item := jsonb_strip_nulls(jsonb_build_object(
    'link', new.link,
    'viatura_id', new.viatura_id,
    'candidatura_id', new.candidatura_id,
    'evento_id', new.evento_id,
    'rule_run_id', new.rule_run_id,
    'mensagem', new.mensagem,
    'em', coalesce(new.created_at, now())
  ));

  -- Regra 0: quem está sujeito à RLS nunca agrupa — sem isto, o UPDATE abaixo
  -- escrevia em linhas que a RLS não o deixa tocar.
  if current_user in ('authenticated', 'anon') then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- Regra 1 (inalterada): urgentes nunca agrupam.
  if new.severidade = 'urgente' then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- Regra 2 (inalterada): sem destinatário individual não há grupo — é uma
  -- colisão entre pessoas diferentes que vêem a mesma linha por cargo.
  if new.destinatario_id is null then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- Regra 3 (inalterada): uma linha procurável por chave de entidade nunca agrupa.
  if new.candidatura_id is not null or new.evento_id is not null then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(new.org_id::text, '') || '|' ||
    new.destinatario_id::text || '|' ||
    new.tipo || '|' ||
    (coalesce(new.created_at, now()))::date::text, 0));

  select id into v_id
  from public.notificacoes
  where org_id is not distinct from new.org_id
    and destinatario_id = new.destinatario_id
    and tipo = new.tipo
    and resolvida = false
    and severidade <> 'urgente'
    -- Simétrico da Regra 3: nunca fundir PARA DENTRO de uma linha com chave de
    -- entidade (ex.: as 6 linhas infladas que já existem).
    and candidatura_id is null
    and evento_id is null
    and created_at >= date_trunc('day', coalesce(new.created_at, now()))
    and created_at <  date_trunc('day', coalesce(new.created_at, now())) + interval '1 day'
  order by created_at, id
  limit 1;

  if v_id is null then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- Idempotência do agrupamento: se este run já contribuiu para esta linha, o
  -- retry é um no-op. Runs DIFERENTES continuam a poder contribuir.
  if new.rule_run_id is not null and exists (
    select 1 from public.notificacoes n
    where n.id = v_id
      and n.itens @> jsonb_build_array(jsonb_build_object('rule_run_id', new.rule_run_id))
  ) then
    return null;
  end if;

  update public.notificacoes
  set agrupadas = agrupadas + 1,
      itens = coalesce(itens, '[]'::jsonb) || v_item
  where id = v_id;

  return null;
end;
$function$;

NOTIFY pgrst, 'reload schema';
