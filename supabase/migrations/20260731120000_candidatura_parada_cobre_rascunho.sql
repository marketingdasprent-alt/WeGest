-- ============================================================
-- Alerta de candidatura parada: passar a cobrir 'rascunho'
-- ============================================================
-- O alerta criado em 20260728160000 varre candidaturas em
-- 'submetido' ou 'em_analise' há mais de 3 dias. Está activo nas 5
-- organizações desde 28/07 e NUNCA disparou uma única vez.
--
-- A razão, medida em produção a 31/07: não existe uma única
-- candidatura nesses dois estados. Os dados reais só usam dois:
--
--   Década Ousada  → 30 'aprovado',  3 'rascunho' (a mais antiga há 58 dias)
--   PREMIUM RIDE   →  1 'aprovado',  1 'rascunho' (há 18 dias)
--
-- Na prática o candidato preenche o formulário e, ou submete e é
-- aprovado no mesmo movimento, ou fica em 'rascunho' e desaparece.
-- 'submetido' e 'em_analise' são estados que o código sabe escrever
-- mas que o uso real atravessa depressa de mais para serem apanhados
-- por um scan diário.
--
-- Resultado: as 4 candidaturas que estão mesmo paradas — pessoas que
-- começaram a candidatar-se e nunca terminaram — são invisíveis. E o
-- teste pgTAP não apanhou isto porque cria os seus próprios dados em
-- 'submetido': está verde desde o primeiro dia sobre uma
-- funcionalidade que nunca funcionou em produção.
--
-- Correcção: incluir 'rascunho', com um prazo próprio mais folgado.
-- Um rascunho de 2 dias é alguém a preencher o formulário com calma;
-- um rascunho de 7 dias é um candidato perdido, e é a única altura em
-- que ainda vale a pena telefonar-lhe.
--
-- Verificado antes de escrever: a condição nova, corrida em produção
-- apenas como SELECT, devolve exactamente as 4 candidaturas paradas
-- (58, 33, 18 e 14 dias). A condição antiga devolve zero.
-- ============================================================

create or replace function public.emit_candidaturas_paradas_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    c.org_id,
    'motorista.candidatura_parada',
    'motorista_candidaturas',
    c.id,
    jsonb_build_object(
      'nome', c.nome,
      'email', c.email,
      'status', c.status,
      'data_submissao', coalesce(c.data_submissao, c.created_at),
      -- Texto pronto a usar no email: 'rascunho' e 'submetido' são
      -- situações diferentes e pedem acções diferentes de quem lê.
      'situacao', case c.status
        when 'rascunho' then 'começou a candidatura e nunca a submeteu'
        else 'está à espera de decisão'
      end
    ),
    'cron'
  from public.motorista_candidaturas c
  where c.org_id is not null
    and (
      -- Submetida e sem decisão: 3 dias (regra original, inalterada).
      (
        c.status in ('submetido', 'em_analise')
        and coalesce(c.data_submissao, c.created_at) <= now() - interval '3 days'
      )
      -- Rascunho abandonado: 7 dias. Prazo maior porque preencher a
      -- candidatura ao longo de alguns dias é comportamento normal.
      or (
        c.status = 'rascunho'
        and c.created_at <= now() - interval '7 days'
      )
    )
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'motorista_candidaturas'
        and e.entity_id = c.id
        and e.event_type = 'motorista.candidatura_parada'
        and e.processed_at is null
    );
end;
$$;

revoke all on function public.emit_candidaturas_paradas_events() from public, anon, authenticated;
grant execute on function public.emit_candidaturas_paradas_events() to service_role;

-- O corpo do email dizia 'está em "{{status}}" (...) sem decisão final',
-- que para um rascunho é falso: não há nada para decidir, o candidato é
-- que não terminou. Passa a usar {{situacao}}, preenchido acima.
update public.notification_templates
set corpo_template = 'A candidatura de {{nome}} ({{email}}) {{situacao}} desde {{data_submissao}}. Confirma se já foi tratada.',
    variaveis_esperadas = array['nome', 'email', 'situacao', 'data_submissao']
where codigo = 'motorista.candidatura_parada'
  and canal = 'email';
