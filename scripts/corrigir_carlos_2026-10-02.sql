-- Carlos Henrique da Silva Oliveira e Carlos Moreira de Oliveira (Década Ousada).
-- As contas estavam trocadas nas fichas, e é pela ficha que cada importação
-- decide de quem é cada linha. Confirmado pelos ficheiros da Uber e da Bolt
-- (nome em cada ficheiro) e pelos valores da semana de 21/09.
--
--   Carlos Henrique : Bolt 91886e66...  Uber 96dd343a... (CARLOS HENRIQUE DA SILVA DE OLIVEIRA)
--   Carlos Moreira  : Bolt f9d7ff1c...  Uber 831bbc69... ("Carlos Oliveira")
--
-- Usa mover_identidade_plataforma: troca o ID na ficha e na identidade, tira-o
-- da ficha que o tinha e passa o que já foi importado para o dono certo, de
-- 21/09 em diante. As semanas já pagas não mudam; o fecho por pagar de quem
-- perde a semana sai e refaz-se ao abrir a semana.
--
-- APLICADO em produção a 02/10/2026 (pelo conector, com v_aplicar a true).
-- Mantém-se com false para quem o abrir não gravar sem querer.
--
-- COMO CORRER: assim como está, simula e acaba num erro de propósito com o
-- resultado (nada fica gravado). Para gravar, muda v_aplicar para true.

do $$
declare
  v_aplicar  constant boolean := false;
  v_desde    constant date := date '2026-09-21';
  v_org      uuid;
  v_henrique uuid;
  v_moreira  uuid;
  v_eduardo  uuid;
  v_relatorio text;
begin
  select id into v_org from public.organizacoes where nome ilike 'Década Ousada%' limit 1;

  -- STRICT: falha se houver zero ou mais do que uma ficha activa com o nome.
  select id into strict v_henrique from public.motoristas_ativos
   where org_id = v_org and status_ativo is distinct from false and nome ilike '%Carlos Henrique%Oliveira%';
  select id into strict v_moreira from public.motoristas_ativos
   where org_id = v_org and status_ativo is distinct from false and nome ilike '%Carlos Moreira%Oliveira%';
  -- Está inactivo e tem a conta Uber do Henrique na ficha: procura-se em qualquer estado.
  select id into v_eduardo from public.motoristas_ativos
   where org_id = v_org and nome ilike '%Carlos Eduardo Rodrigues da Silva%' limit 1;

  -- Primeiro as do Moreira, que libertam as contas que estavam na ficha do Henrique.
  perform public.mover_identidade_plataforma(v_org, 'bolt', 'f9d7ff1c-1d6b-49fe-b22b-88ddee91db00', v_moreira, true, v_desde);
  perform public.mover_identidade_plataforma(v_org, 'uber', '831bbc69-ba41-4e28-ab22-8b322251019b', v_moreira, true, v_desde);
  perform public.mover_identidade_plataforma(v_org, 'bolt', '91886e66-111f-40b3-8371-917187738f55', v_henrique, true, v_desde);
  perform public.mover_identidade_plataforma(v_org, 'uber', '96dd343a-0f66-482b-8624-9cdf8b65a589', v_henrique, true, v_desde);

  select string_agg(x.linha, E'\n' order by x.ordem, x.linha) into v_relatorio
    from (
      select 1 as ordem,
             'FICHA   ' || m.nome || ' | bolt_id=' || coalesce(m.bolt_id, '-') ||
             ' | uber_uuid=' || coalesce(m.uber_uuid, '-') as linha
        from public.motoristas_ativos m where m.id in (v_henrique, v_moreira, v_eduardo)
      union all
      select 2,
             'SEMANA 21/09  ' || m.nome ||
             ' | Uber ' || coalesce((select sum(u.ganhos_brutos) from public.uber_resumos_semanais u
                                      where u.motorista_id = m.id and u.periodo_inicio = v_desde), 0) ||
             ' | Bolt ' || coalesce((select sum(b.ganhos_liquidos) from public.bolt_resumos_semanais b
                                      where b.motorista_id = m.id and b.periodo_inicio = v_desde), 0)
        from public.motoristas_ativos m where m.id in (v_henrique, v_moreira, v_eduardo)
      union all
      select 3,
             'ATENCAO ' || m.nome || ' ficou sem conta ' || p.plataforma ||
             ': diz-me o ID real dele'
        from public.motoristas_ativos m
        cross join (values ('Uber'), ('Bolt')) as p(plataforma)
       where m.id = v_eduardo and m.status_ativo is distinct from false
         and ((p.plataforma = 'Uber' and m.uber_uuid is null) or (p.plataforma = 'Bolt' and m.bolt_id is null))
    ) x;

  if not v_aplicar then
    raise exception E'SIMULAÇÃO: nada foi gravado.\n%', v_relatorio;
  end if;
  raise notice E'%', v_relatorio;
end $$;
