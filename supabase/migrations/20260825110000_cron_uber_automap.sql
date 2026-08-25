-- ============================================================
-- O auto-map da Uber deixa de depender de quem chamou a importação
-- ============================================================
-- PORQUÊ
-- O `uber-auto-map-drivers` só era invocado no fim do `uber-import-reports`.
-- Mas a Premium Ride importa pelo `uber-webhook`, que nunca o chamava — e por
-- isso, desde Julho de 2026, todos os motoristas que entraram por lá ficaram
-- com `motorista_id` a null. Nove de uma vez.
--
-- Não davam erro: o ecrã de Contas/Resumo compara pelo primeiro+último nome
-- quando não há ficha ligada (ContasResumoTab.tsx, normalizeFirstLast), por
-- isso os valores até apareciam certos. Ficavam é dependentes do nome estar
-- bem escrito — e uma gralha ("Pinha" em vez de "Pinho") manda o dinheiro
-- para outra pessoa.
--
-- A chamada foi acrescentada ao uber-webhook, mas as edge functions deste
-- projeto publicam-se à mão e o repositório já tinha divergido da produção
-- (o auto-map corria a v12, sem filtro por organização, enquanto o repositório
-- tinha a versão corrigida). Esta rede não depende de nenhuma delas estar
-- publicada: corre de meia em meia hora e apanha qualquer motorista por ligar,
-- venha a importação de onde vier.
--
-- É seguro repetir: o auto-map só olha para linhas com `motorista_id` a null,
-- e o trigger de 20260825100000 recusa qualquer ligação entre empresas.
--
-- Idempotente e aditiva.
--
-- COMO APLICAR: colar no SQL Editor. Este projeto não tem o CLI da Supabase.

create or replace function public.uber_automap_todas_integracoes()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_integracao record;
  v_invocadas  integer := 0;
begin
  for v_integracao in
    -- Só integrações Uber activas e que tenham motoristas por ligar. Sem o
    -- segundo critério, isto disparava um pedido HTTP por integração de meia
    -- em meia hora, para nada.
    select distinct p.id, p.nome
    from public.plataformas_configuracao p
    join public.uber_drivers u on u.integracao_id = p.id
    where p.ativo = true
      and p.org_id is not null
      and u.motorista_id is null
  loop
    perform public.cron_invocar_edge(
      'uber-automap-' || v_integracao.id::text,
      'uber-auto-map-drivers',
      jsonb_build_object('integracao_id', v_integracao.id),
      120000
    );
    v_invocadas := v_invocadas + 1;
  end loop;

  return v_invocadas;
end;
$fn$;

comment on function public.uber_automap_todas_integracoes() is
  'Invoca o uber-auto-map-drivers para cada integração Uber activa com motoristas por ligar. Rede de segurança para os caminhos de importação que não o chamam (uber-webhook).';

revoke all on function public.uber_automap_todas_integracoes() from public, anon, authenticated;

select cron.unschedule('uber-automap-periodico')
where exists (select 1 from cron.job where jobname = 'uber-automap-periodico');

select cron.schedule(
  'uber-automap-periodico',
  '*/30 * * * *',
  $cron$select public.uber_automap_todas_integracoes()$cron$
);
