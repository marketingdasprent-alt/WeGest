-- ============================================================================
-- A gémea de email passa a herdar o grupo_id da regra que a originou
-- ============================================================================
--
-- `fn_dividir_email_das_regras` (20260901110000) cria a gémea de email sem
-- indicar `grupo_id` — cai no valor por omissão de `gen_random_uuid()`
-- (20260903090000), nunca no da regra-mãe. Resultado: os 66 pares
-- notificação/email já existentes nunca aparecem agrupados no construtor
-- como "uma automação, duas acções" — cada metade é uma automação separada
-- na lista, e é impossível editá-las juntas.
--
-- Corrige as duas pontas: a função passa a herdar o grupo_id (para toda
-- organização nova, via o gatilho de seed), e esta migração corrige os 66
-- pares que já nasceram separados.
-- ============================================================================

create or replace function public.fn_dividir_email_das_regras(p_org_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_regra   public.automation_rules;
  v_criadas int := 0;
begin
  for v_regra in
    select * from public.automation_rules
    where org_id = p_org_id
      and acao_tipo = 'notificacao'
      and coalesce((acao_config->>'enviar_email')::boolean, false)
    order by codigo
  loop
    insert into public.automation_rules (
      org_id, codigo, nome, descricao, event_type, condicoes,
      acao_tipo, acao_config, prioridade, cooldown_minutos, ativo, criado_por,
      grupo_id
    )
    values (
      p_org_id,
      v_regra.codigo || '.email',
      left(v_regra.nome || ' (email)', 200),
      'Nasceu da divisão entre notificação e email. Envia por correio o que a regra '
        || v_regra.codigo || ' enviava.',
      v_regra.event_type,
      v_regra.condicoes,
      'email',
      v_regra.acao_config - 'enviar_email',
      v_regra.prioridade,
      v_regra.cooldown_minutos,
      v_regra.ativo,
      null,
      -- A gémea é a mesma automação, com outra acção — não uma automação à
      -- parte. Sem isto, o construtor de "várias acções por automação"
      -- nunca as via juntas.
      v_regra.grupo_id
    )
    on conflict (codigo, org_id) do nothing;

    if found then
      v_criadas := v_criadas + 1;
    end if;
  end loop;

  update public.automation_rules
     set acao_config = acao_config - 'enviar_email' - 'enviar_email_digest'
   where org_id = p_org_id
     and acao_tipo = 'notificacao'
     and (acao_config ? 'enviar_email' or acao_config ? 'enviar_email_digest');

  return v_criadas;
end;
$function$;

-- ── Os pares que já nasceram separados ──────────────────────────────────────
do $$
declare
  v_corrigidos int;
  v_esperados  int;
begin
  select count(*) into v_esperados
  from public.automation_rules n
  join public.automation_rules e
    on e.org_id = n.org_id
   and e.codigo = n.codigo || '.email'
   and e.acao_tipo = 'email'
  where n.acao_tipo = 'notificacao'
    and e.grupo_id <> n.grupo_id;

  update public.automation_rules e
     set grupo_id = n.grupo_id
    from public.automation_rules n
   where n.org_id = e.org_id
     and e.codigo = n.codigo || '.email'
     and n.acao_tipo = 'notificacao'
     and e.acao_tipo = 'email'
     and e.grupo_id <> n.grupo_id;

  get diagnostics v_corrigidos = row_count;

  if v_corrigidos <> v_esperados then
    raise exception 'Esperava corrigir % pares, corrigi %.', v_esperados, v_corrigidos;
  end if;

  raise notice 'grupo_id corrigido em % pares notificação/email.', v_corrigidos;
end $$;
