-- ============================================================
-- Trava de segurança: limite diário de emails por organização
-- ============================================================
-- Incidente de 2026-07-27: um backlog de 84 contratos gerou 1764 emails
-- num único dia para 21 pessoas. O digest diário (migration 360000) já
-- resolve o caso da renovação de renting, mas nada impedia que uma nova
-- automação (ou um bug futuro) voltasse a inundar a caixa de entrada.
--
-- Esta migration adiciona um limite rígido de emails por org por dia,
-- aplicado no único ponto onde TODOS os emails passam antes de seguir
-- para o Brevo: notification_queue_claim(). Emails a mais do que o
-- limite ficam 'pending' e são retomados automaticamente no dia
-- seguinte (o limite é por dia civil) — não há perda de dados, só
-- atraso. Na primeira vez que o limite é atingido num dia, os admins
-- da org recebem UM aviso interno (bell + email não, para não repetir
-- o próprio incidente).
-- ============================================================

create or replace function public.notification_queue_claim(p_canal text, p_max integer default 10)
returns setof notification_queue
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cap_diario_email constant integer := 300;
  v_org record;
begin
  update public.notification_queue
  set status = 'failed',
      error_message = coalesce(error_message || ' | ', '') || 'timeout: running há mais de 15 minutos'
  where status = 'running'
    and canal = p_canal
    and started_at < now() - interval '15 minutes';

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
$function$;

-- Torna a nova notificação de sistema visível na bell (mesmo padrão das
-- outras notificações automáticas dirigidas a um destinatário concreto).
drop policy if exists "ver notificacoes do meu cargo" on public.notificacoes;
create policy "ver notificacoes do meu cargo" on public.notificacoes
for select using (
  (org_id is null or org_id = get_current_org_id())
  and (
    (tipo = 'motorista_pendente' and (is_current_user_admin() or current_user_cargo() = any (array['Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE'])))
    or (tipo = any (array['escalonamento', 'pedido_troca_kms']) and (is_current_user_admin() or current_user_cargo() = 'Supervisor Gestor TVDE'))
    or (
      tipo = any (array[
        'viatura_disponivel', 'recibo_anulado', 'viatura_seguro_expirando',
        'viatura_inspecao_expirando', 'motorista_carta_expirando',
        'motorista_licenca_tvde_expirando', 'cobranca_gerada', 'utilizador_criado',
        'contrato_renting_renovacao_proxima', 'sistema_limite_email_atingido'
      ])
      and destinatario_id = auth.uid()
    )
  )
);
