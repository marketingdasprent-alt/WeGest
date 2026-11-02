-- Ganhos Bolt sem atividade no CSV passam a entrar.
--
-- A 02/11 o CSV da Bolt Açores trouxe 5 motoristas com ganhos e 0 viagens,
-- 0 min e 0 km: a guarda recusou-os e a semana ficou sem esse dinheiro. A API
-- mostrou depois que tinham viagens — o relatório é que vinha sem atividade.
-- O que a guarda protege (incidente de 10/08) é o ficheiro da semana errada,
-- e esse apanha-se pela cópia exacta da semana anterior: passa a ser a única
-- recusa, para todas as contas (era só nas com csv_sem_metricas_atividade).

create or replace function public.fn_bolt_recusa_ganhos_sem_atividade()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_anterior numeric;
begin
  if TG_OP = 'UPDATE'
     and NEW.ganhos_liquidos is not distinct from OLD.ganhos_liquidos
     and NEW.periodo_inicio is not distinct from OLD.periodo_inicio then
    return NEW;
  end if;

  if coalesce(NEW.ganhos_liquidos, 0) <= 0
     or coalesce(NEW.viagens_terminadas, 0) <> 0
     or coalesce(NEW.tempo_online_min, 0) <> 0
     or coalesce(NEW.distancia_total_km, 0) <> 0
     or coalesce(NEW.ganhos_campanha, 0) <> 0
     or coalesce(NEW.reembolsos_despesas, 0) <> 0
  then
    return NEW;
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

comment on column public.plataformas_configuracao.csv_sem_metricas_atividade is
  'Sem efeito desde 02/11/2026: a guarda de bolt_resumos_semanais aceita ganhos sem atividade em todas as contas e só recusa a cópia exacta da semana anterior.';

NOTIFY pgrst, 'reload schema';
