-- ============================================================
-- Não voltar a avisar sobre uma entidade que já tem aviso por resolver
-- ============================================================
-- CAUSA DO BACKLOG (medido em 2026-08-26)
-- As regras de expiração têm cooldown_minutos = 1440. process_domain_events()
-- lê isso como "podes voltar a disparar daqui a 24h" — e dispara. Um seguro
-- que caduca daqui a 30 dias gera um aviso HOJE, amanhã, e todos os dias até
-- alguém o renovar, a 23 pessoas. Resultado: 3811 avisos por resolver, dos
-- quais 458 linhas / 53741 factos só para 'viatura_seguro_expirando' —
-- 251 viaturas x 31 dias x 23 pessoas.
--
-- Não é as pessoas não resolverem: é o sistema voltar a afirmar o mesmo facto
-- todos os dias. Resolver não adiantava, porque no dia seguinte voltava.
--
-- A REGRA NOVA
-- Enquanto existir aviso POR RESOLVER para a mesma (org, tipo, entidade), não
-- se cria run nenhum — logo não há notificação nem email. Quando alguém
-- resolver, o ciclo normal (cooldown de 24h) volta a valer e o aviso reaparece
-- se a condição persistir. O aviso não desaparece: continua no sino até ser
-- tratado. Deixa é de se multiplicar.
--
-- COMO A ENTIDADE É ENCONTRADA
-- notificacoes não tem entity_id. Tem `link` (rota canónica da entidade) e,
-- quando a linha é um grupo, as entidades vivem em `itens[].link`. As duas vias
-- são testadas, ambas indexadas (idx_notificacoes_abertas_org_tipo + GIN em
-- itens, criados na migração anterior).
--
-- PORQUE O CHECK DE automation_logs TEM DE MUDAR PRIMEIRO
-- `evento` tem um CHECK fechado de 4 valores. O insert do novo motivo levantaria
-- check_violation DENTRO de process_domain_events(), que não tem handler à volta
-- deste insert — a função abortava e o motor deixava de processar eventos.
-- Mesma classe de defeito que já custou 'recibo_anulado' e 'cobranca_tvde_zero'.

alter table public.automation_logs drop constraint if exists automation_logs_evento_check;
alter table public.automation_logs add constraint automation_logs_evento_check
  check (evento = any (array[
    'executada', 'falhou', 'ignorada_cooldown', 'condicao_nao_satisfeita',
    'ignorada_aviso_em_aberto'
  ]));

-- ------------------------------------------------------------

create or replace function public.process_domain_events(p_max integer default 50)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_rule record;
  v_condicao jsonb;
  v_matches boolean;
  v_cooldown_ok boolean;
  v_tipo_legado text;
  v_link text;
begin
  for v_event in
    select * from public.domain_events
    where processed_at is null
    order by occurred_at asc
    limit p_max
  loop
    -- Calculado uma vez por evento (não por regra): a entidade é a mesma.
    select m.tipo_legado into v_tipo_legado
    from public.notificacao_tipo_map m
    where m.event_type = v_event.event_type;

    v_link := public.notificacao_link_entidade(v_event.entity_table, v_event.entity_id);

    for v_rule in
      select * from public.automation_rules
      where ativo = true
        and org_id = v_event.org_id
        and event_type = v_event.event_type
    loop
      v_matches := true;

      if jsonb_typeof(v_rule.condicoes) = 'array' then
        for v_condicao in select * from jsonb_array_elements(v_rule.condicoes)
        loop
          if v_condicao->>'operador' = '=' then
            if (v_event.payload->>(v_condicao->>'campo')) is distinct from (v_condicao->>'valor') then
              v_matches := false;
            end if;
          elsif v_condicao->>'operador' = '!=' then
            if (v_event.payload->>(v_condicao->>'campo')) is not distinct from (v_condicao->>'valor') then
              v_matches := false;
            end if;
          end if;
        end loop;
      end if;

      if not v_matches then
        insert into public.automation_logs (rule_id, org_id, evento, detalhe)
        values (v_rule.id, v_rule.org_id, 'condicao_nao_satisfeita', jsonb_build_object('event_id', v_event.id));
        continue;
      end if;

      -- NOVO: já existe aviso por resolver para esta entidade e este tipo?
      -- Se sim, repetir não acrescenta informação nenhuma — só ruído. Fica
      -- registado em automation_logs para o motivo ser auditável.
      if v_tipo_legado is not null and v_link is not null then
        if exists (
          select 1
          from public.notificacoes n
          where n.org_id = v_event.org_id
            and n.tipo = v_tipo_legado
            and not n.resolvida
            and (
              n.link = v_link
              or n.itens @> jsonb_build_array(jsonb_build_object('link', v_link))
            )
        ) then
          insert into public.automation_logs (rule_id, org_id, evento, detalhe)
          values (v_rule.id, v_rule.org_id, 'ignorada_aviso_em_aberto',
                  jsonb_build_object('event_id', v_event.id, 'tipo', v_tipo_legado, 'link', v_link));
          continue;
        end if;
      end if;

      -- Cooldown (inalterado): trava a repetição quando o aviso JÁ foi
      -- resolvido mas a condição persiste.
      v_cooldown_ok := true;
      if v_rule.cooldown_minutos > 0 then
        select not exists (
          select 1
          from public.automation_runs r
          where r.rule_id = v_rule.id
            and r.entity_table = v_event.entity_table
            and r.entity_id = v_event.entity_id
            and r.created_at > now() - (v_rule.cooldown_minutos * interval '1 minute')
        ) into v_cooldown_ok;
      end if;

      if not v_cooldown_ok then
        insert into public.automation_logs (rule_id, org_id, evento, detalhe)
        values (v_rule.id, v_rule.org_id, 'ignorada_cooldown', jsonb_build_object('event_id', v_event.id));
        continue;
      end if;

      begin
        insert into public.automation_runs (rule_id, org_id, trigger_event_id, entity_table, entity_id, payload)
        values (v_rule.id, v_rule.org_id, v_event.id, v_event.entity_table, v_event.entity_id, v_event.payload);
      exception when unique_violation then
        null; -- já há um run ativo para esta regra+entidade — nada a fazer.
      end;
    end loop;

    update public.domain_events set processed_at = now() where id = v_event.id;
  end loop;
end;
$$;

comment on function public.process_domain_events(integer) is
  'Casa domain_events com automation_rules e cria automation_runs. Três travões, por ordem: condições da regra; aviso já em aberto para a mesma entidade (evita a re-emissão diária que gerou 3811 pendentes); cooldown da regra.';
