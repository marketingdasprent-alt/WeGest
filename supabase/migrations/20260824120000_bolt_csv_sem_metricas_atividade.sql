-- ============================================================
-- Bolt: contas cujo CSV não traz métricas de atividade
-- ============================================================
-- A guarda de 20260818110000 recusa ganhos sem UMA viagem, UM minuto online,
-- UM km, campanha ou reembolso — a assinatura do incidente de 10/08, em que
-- ~1.844 EUR fantasma entraram e ficaram 4 dias sem ninguém dar por eles.
-- Essa guarda continua a fazer falta e não sai daqui.
--
-- O que ela não previa: nem todas as contas exportam as mesmas colunas.
--
-- A Bolt Lara (PREMIUM RIDE) importa por CSV desde 22/06 — 52 semanas,
-- 12.740 EUR. Em NENHUMA dessas semanas houve uma única linha com
-- viagens_terminadas > 0. O relatório que essa conta exporta do portal traz
-- ganhos e não traz atividade nenhuma, e sempre foi assim.
--
-- Resultado: a 24/08, primeira importação depois da guarda entrar, 13 das 16
-- linhas foram recusadas e 2.126,76 EUR ficaram de fora. As 3 que passaram
-- escaparam por acaso — tinham campanha ou reembolso, que a guarda aceita
-- como justificação. A semana ficou meia escrita, que é pior do que vazia:
-- parece completa. E é sobre ela que a PREMIUM RIDE paga aos motoristas.
--
-- COMO SE RESOLVE
-- Um interruptor por integração, não global. A conta declara "o meu CSV não
-- traz métricas de atividade" e a guarda deixa de exigir o que a fonte nunca
-- forneceu. Fica explícito e auditável: quem olhar para a configuração vê
-- porque é que aquela conta é diferente, em vez de a excepção estar escondida
-- no código.
--
-- A protecção não desaparece nessas contas — é substituída pela que apanha o
-- incidente real. O que aconteceu a 10/08 não foi "ganhos sem atividade", foi
-- um ficheiro da semana anterior importado na semana seguinte: os valores
-- eram cópia exacta. Passa a ser isso que se recusa, e é uma verificação mais
-- certeira do que a original — apanha o ficheiro trocado mesmo quando ele traz
-- atividade toda.

-- ── 1. O interruptor ──────────────────────────────────────────────────────
alter table public.plataformas_configuracao
  add column if not exists csv_sem_metricas_atividade boolean not null default false;

comment on column public.plataformas_configuracao.csv_sem_metricas_atividade is
  'O relatório que esta conta exporta do portal Bolt não traz viagens, minutos online nem km — só ganhos. Desliga a exigência de atividade na guarda de bolt_resumos_semanais, que passa a recusar por cópia exacta da semana anterior.';

-- ── 2. A guarda, agora com os dois caminhos ───────────────────────────────
create or replace function public.fn_bolt_recusa_ganhos_sem_atividade()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sem_metricas boolean;
  v_anterior     numeric;
begin
  -- Nada a decidir: ou não há dinheiro, ou há atividade/campanha/reembolso
  -- que o justifique.
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

  -- Conta normal: a assinatura continua a ser impossível. Falha alto.
  if not coalesce(v_sem_metricas, false) then
    raise exception
      'Bolt: % EUR de ganhos sem atividade nenhuma (0 viagens, 0 min online, 0 km, '
      'sem campanha nem reembolso) para "%" no período %. Isto costuma ser um '
      'ficheiro de outra semana importado por engano — confirme o período do CSV '
      'antes de reimportar.',
      NEW.ganhos_liquidos, coalesce(NEW.motorista_nome, NEW.chave_motorista, '?'),
      coalesce(NEW.periodo, NEW.periodo_inicio::text, '?');
  end if;

  -- Conta cujo relatório não traz atividade: exigir viagens seria exigir uma
  -- coluna que o ficheiro não tem. Verifica-se antes o que denuncia mesmo o
  -- ficheiro trocado — o valor ser cópia exacta, ao cêntimo, do que o mesmo
  -- motorista teve na semana anterior.
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

-- ── 3. Ligar o interruptor onde é caso disso ──────────────────────────────
-- Só a Bolt Lara: 52 semanas importadas, zero linhas com viagens alguma vez.
-- Deliberadamente por nome e com a verificação do histórico, para não ligar
-- isto numa conta em que a ausência de atividade seja anomalia e não formato.
update public.plataformas_configuracao p
set csv_sem_metricas_atividade = true
where p.nome = 'Bolt Lara'
  and (p.plataforma = 'bolt' or p.robot_target_platform = 'bolt')
  and not exists (
    select 1 from public.bolt_resumos_semanais r
    where r.integracao_id = p.id and coalesce(r.viagens_terminadas, 0) > 0
  );
