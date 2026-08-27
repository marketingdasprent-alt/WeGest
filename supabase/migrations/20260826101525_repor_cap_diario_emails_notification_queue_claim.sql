-- ============================================================
-- Repõe a trava de segurança de emails que se perdeu numa reescrita
-- ============================================================
-- ESTA MIGRAÇÃO NÃO ACRESCENTA UMA FUNCIONALIDADE NOVA. Repõe uma que já
-- existiu, esteve activa um dia, e desapareceu sem ninguém dar por isso.
--
-- CRONOLOGIA
--  2026-07-27  Incidente: um backlog de 84 contratos gerou 1764 emails num
--              único dia para 21 pessoas.
--  2026-07-28  20260728110000_limite_diario_emails.sql cria a trava: um cap de
--              300 emails por organização por dia, aplicado dentro de
--              notification_queue_claim() — o único ponto por onde TODOS os
--              emails passam antes de seguirem para o Brevo. Emails acima do
--              limite ficam 'pending' e são retomados no dia seguinte (sem
--              perda de dados), e os admins recebem UM aviso interno.
--  2026-07-29  20260729100000_hardening_falhas_silenciosas_brevo... corrige um
--              defeito diferente e legítimo na MESMA função (o sweep de itens
--              presos marcava status='failed' com um UPDATE directo, sem
--              passar por notification_queue_fail() — logo sem backoff, sem
--              dead-letter em failed_jobs e sem alerta). Para o fazer,
--              reescreveu o CORPO INTEIRO a partir da versão de 20260727130100
--              — a versão ANTERIOR ao cap. O bloco do cap não foi removido de
--              propósito: foi deixado para trás.
--
-- CONFIRMADO EM PRODUÇÃO (2026-08-26), lendo pg_get_functiondef():
--   · o sweep chama notification_queue_fail()      → a correcção de 29/07 está lá
--   · não há vestígio de v_cap_diario_email        → a trava de 28/07 NÃO está
--
-- Está portanto a correr, hoje, sem nenhum limite de emails por dia. A causa
-- que produziu 1764 emails numa manhã continua exactamente onde estava.
--
-- ESTE É O QUARTO CASO DO MESMO PADRÃO NESTA FEATURE
--   · 'recibo_anulado' perdido de notificacoes_tipo_check (documentado em
--     20260727240000)
--   · 'cobranca_tvde_zero' perdido do mesmo CHECK em 20260727240000 e nunca
--     reposto — gerar_cobrancas_tvde_semanais() ainda o tenta inserir
--   · notifications.link nunca gravado apesar de calculado (20260729110000)
--   · e agora o cap diário de emails
--
-- Todos com a mesma origem: `create or replace function` com o corpo inteiro
-- copiado à mão, sobre uma função que outra migração tinha alterado entretanto.
-- Enquanto as alterações a estas funções forem feitas por cópia integral, isto
-- volta a acontecer. É o item 3.4 do plano de correcção (decompor
-- execute_automation_runs e companhia em partes substituíveis isoladamente).
--
-- O que se faz aqui: parte-se da versão QUE ESTÁ EM PRODUÇÃO (com o sweep
-- correcto) e volta-se a enxertar o bloco do cap, tal como estava.
-- ============================================================

create or replace function public.notification_queue_claim(p_canal text, p_max integer default 10)
returns setof public.notification_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap_diario_email constant integer := 300;
  v_stale record;
  v_org record;
begin
  -- Itens presos há mais de 15 minutos. Passa por notification_queue_fail()
  -- (e não por um UPDATE directo) para haver backoff, dead-letter em
  -- failed_jobs e alerta aos admins — correcção de 20260729100000, preservada.
  for v_stale in
    select id from public.notification_queue
    where status = 'running' and canal = p_canal and started_at < now() - interval '15 minutes'
  loop
    perform public.notification_queue_fail(v_stale.id, 'timeout: running há mais de 15 minutos');
  end loop;

  -- Trava de segurança: avisar UMA vez por dia e por org quando o cap é
  -- atingido e ainda há coisa em espera. Sem email neste aviso, de propósito —
  -- avisar por email que se atingiu o limite de emails seria repetir o
  -- incidente que a trava existe para evitar.
  if p_canal = 'email' then
    for v_org in
      select q.org_id, count(*) filter (where q.status = 'pending') as pendentes
      from public.notification_queue q
      where q.canal = 'email'
        and q.created_at >= date_trunc('day', now())
      group by q.org_id
      having count(*) filter (where q.status in ('sent', 'running')) >= v_cap_diario_email
         and count(*) filter (where q.status = 'pending') > 0
    loop
      if not exists (
        select 1 from public.notifications
        where org_id = v_org.org_id
          and template_codigo = 'sistema.limite_email_atingido'
          and created_at >= date_trunc('day', now())
      ) then
        insert into public.notifications
          (org_id, destinatario_user_id, template_codigo, titulo, mensagem, link, payload)
        select
          v_org.org_id,
          uo.user_id,
          'sistema.limite_email_atingido',
          'Limite diário de emails atingido',
          v_org.pendentes || ' email(s) ficam em espera até amanhã (limite de segurança: '
            || v_cap_diario_email || '/dia)',
          '/admin/automacao',
          jsonb_build_object('pendentes', v_org.pendentes, 'limite', v_cap_diario_email)
        from public.user_organizacoes uo
        where uo.org_id = v_org.org_id and uo.is_admin = true;

        insert into public.notificacoes
          (org_id, tipo, titulo, mensagem, severidade, destinatario_id, link)
        select
          v_org.org_id,
          'sistema_limite_email_atingido',
          'Limite diário de emails atingido',
          v_org.pendentes || ' email(s) ficam em espera até amanhã (limite de segurança: '
            || v_cap_diario_email || '/dia)',
          'urgente',
          uo.user_id,
          '/admin/automacao'
        from public.user_organizacoes uo
        where uo.org_id = v_org.org_id and uo.is_admin = true;
      end if;
    end loop;
  end if;

  return query
  update public.notification_queue q
  set status = 'running',
      started_at = now(),
      attempt = q.attempt + 1
  from (
    select c.id
    from public.notification_queue c
    where c.status = 'pending'
      and c.canal = p_canal
      and c.next_attempt_at <= now()
      -- O cap propriamente dito: acima do limite, o item simplesmente não é
      -- reclamado. Fica 'pending' e é retomado amanhã — atraso, nunca perda.
      and (
        p_canal <> 'email'
        or (
          select count(*) from public.notification_queue s
          where s.org_id = c.org_id
            and s.canal = 'email'
            and s.status in ('sent', 'running')
            and s.created_at >= date_trunc('day', now())
        ) < v_cap_diario_email
      )
    order by c.priority asc, c.created_at asc
    limit p_max
    for update skip locked
  ) claimed
  where q.id = claimed.id
  returning q.*;
end;
$$;

comment on function public.notification_queue_claim(text, integer) is
  'Reclama itens da fila para envio. Faz três coisas, e as três têm de sobreviver a qualquer reescrita futura: (1) devolve itens presos ao ciclo de retry via notification_queue_fail(); (2) aplica o cap diário de emails por organização; (3) reclama com FOR UPDATE SKIP LOCKED.';

revoke all on function public.notification_queue_claim(text, integer) from public, anon, authenticated;
grant execute on function public.notification_queue_claim(text, integer) to service_role;
