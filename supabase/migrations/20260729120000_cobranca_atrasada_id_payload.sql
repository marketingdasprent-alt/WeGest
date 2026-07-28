-- Ligação dos templates de email aos crons (chefe pediu): o
-- send-cobrancas-atrasadas passa a usar EmailService.sendCobrancaAtraso
-- (template HTML novo) em vez de HTML inline, e precisa de uma referência
-- por cobrança para mostrar como "Fatura n.º". O payload que
-- emit_lembretes_cobranca_atrasada() envia hoje não inclui o id da
-- cobrança — só acrescenta esse campo, sem alterar a lógica/condições
-- existentes.

create or replace function public.emit_lembretes_cobranca_atrasada()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cobrancas jsonb;
  v_ids uuid[];
begin
  with recibos_por_cobranca as (
    select referencia, sum(valor) as pago
    from public.recibos
    where estado = 'ativo'
    group by referencia
  ),
  creditado_por_cobranca as (
    select cobranca_id, sum(valor) as creditado
    from public.notas_credito
    where estado = 'ativo'
    group by cobranca_id
  ),
  elegiveis as (
    select
      c.id, c.org_id, c.destinatario_nome, c.emitida_em, cl.email,
      round((c.valor_total - coalesce(r.pago, 0) - coalesce(nc.creditado, 0))::numeric, 2) as saldo,
      floor(extract(epoch from (now() - c.emitida_em)) / 86400)::int as dias_em_aberto
    from public.contrato_cobrancas c
    join public.clientes cl on cl.id = c.destinatario_id
    left join recibos_por_cobranca r on r.referencia = c.id::text
    left join creditado_por_cobranca nc on nc.cobranca_id = c.id
    where c.estado = 'emitida'
      and c.lembrete_atraso_enviado_em is null
      and c.emitida_em is not null
      and cl.email is not null
  )
  select
    jsonb_agg(jsonb_build_object(
      'id', e.id,
      'org_id', e.org_id,
      'destinatario_nome', e.destinatario_nome,
      'destinatario_email', e.email,
      'saldo', e.saldo,
      'dias_em_aberto', e.dias_em_aberto
    )),
    array_agg(e.id)
  into v_cobrancas, v_ids
  from elegiveis e
  where e.saldo > 0.005
    and e.dias_em_aberto > 30;

  if v_ids is not null and array_length(v_ids, 1) > 0 then
    perform net.http_post(
      url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/send-cobrancas-atrasadas',
      headers := jsonb_build_object(
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('cobrancas', v_cobrancas)
    );

    update public.contrato_cobrancas
    set lembrete_atraso_enviado_em = now()
    where id = any(v_ids);
  end if;
end;
$$;

revoke all on function public.emit_lembretes_cobranca_atrasada() from public, anon, authenticated;
grant execute on function public.emit_lembretes_cobranca_atrasada() to service_role;
