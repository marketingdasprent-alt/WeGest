-- ⚠️ RECUPERADA de supabase_migrations.schema_migrations (2026-08-28).
-- Aplicada a produção a 2026-08-24 sem ficheiro no repositório. O SQL abaixo é
-- o original registado em `statements`.
create or replace function public.fn_bolt_recusa_ganhos_sem_atividade()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sem_metricas boolean;
  v_anterior     numeric;
begin
  if coalesce(NEW.ganhos_liquidos, 0) <= 0
     or coalesce(NEW.viagens_terminadas, 0) <> 0
     or coalesce(NEW.tempo_online_min, 0) <> 0
     or coalesce(NEW.distancia_total_km, 0) <> 0
     or coalesce(NEW.ganhos_campanha, 0) <> 0
     or coalesce(NEW.reembolsos_despesas, 0) <> 0
  then
    return NEW;
  end if;

  select coalesce(p.csv_sem_metricas_atividade, false)
  into v_sem_metricas
  from public.plataformas_configuracao p
  where p.id = NEW.integracao_id;

  if not coalesce(v_sem_metricas, false) then
    raise exception
      'Bolt: % EUR de ganhos sem atividade nenhuma (0 viagens, 0 min online, 0 km, '
      'sem campanha nem reembolso) para "%" no período %. Isto costuma ser um '
      'ficheiro de outra semana importado por engano — confirme o período do CSV '
      'antes de reimportar.',
      NEW.ganhos_liquidos, coalesce(NEW.motorista_nome, NEW.chave_motorista, '?'),
      coalesce(NEW.periodo, NEW.periodo_inicio::text, '?');
  end if;

  select r.ganhos_liquidos
  into v_anterior
  from public.bolt_resumos_semanais r
  where r.integracao_id = NEW.integracao_id
    and r.chave_motorista = NEW.chave_motorista
    and r.periodo_inicio = NEW.periodo_inicio - 7
  limit 1;

  if v_anterior is not null and v_anterior = NEW.ganhos_liquidos then
    raise exception
      'Bolt: % EUR para "%" no período % são cópia exacta da semana anterior. '
      'É a assinatura de um ficheiro da semana errada — confirme o período do '
      'CSV antes de reimportar.',
      NEW.ganhos_liquidos, coalesce(NEW.motorista_nome, NEW.chave_motorista, '?'),
      coalesce(NEW.periodo, NEW.periodo_inicio::text, '?');
  end if;

  return NEW;
end;
$$;

comment on function public.fn_bolt_recusa_ganhos_sem_atividade() is
  'Trava ganhos Bolt sem atividade nenhuma (incidente de 10/08/2026, ~1.844 EUR fantasma). Nas contas com csv_sem_metricas_atividade=true, onde o relatório nunca traz atividade, troca essa verificação pela recusa de valores que sejam cópia exacta da semana anterior.';
