-- ============================================================
-- A vigência do condutor compara-se ao DIA, não à meia-noite
-- ============================================================
-- O DEFEITO
-- `resolver_devedor_do_cliente` (20260909160000) perguntava
--     cc.vigencia @> p_data::timestamptz
-- e `p_data::timestamptz` é a MEIA-NOITE daquele dia. Uma vigência que começa
-- às 08:43 não contém a meia-noite das 00:00 — logo o condutor não era
-- encontrado, e o gasto ficava imputado a ele em vez de ir para o titular do
-- contrato.
--
-- Apanhado no contrato #881 (Ronald Ferreira / Década Ousada), registado às
-- 08:43:29 de 2026-09-09: dos 53 contratos rent-a-car activos, 52 resolviam
-- bem e este falhava. Não é um caso de fronteira raro — **503 das 717 linhas
-- de `contrato_condutores` (70%) começam a meio do dia**. O primeiro dia de
-- cada condutor perdia-se sempre.
--
-- A CORRECÇÃO
-- A transacção de combustível tem granularidade de DIA (só se sabe o dia em
-- que se atestou, não a hora). A pergunta certa é "esteve condutor em algum
-- momento daquele dia?", que é uma sobreposição de intervalos e não uma
-- continência de instante:
--     cc.vigencia && tstzrange(p_data, p_data + 1, '[)')
--
-- Isto também torna o resultado independente do fuso a que o timestamp foi
-- gravado, que o `@>` não era.
--
-- O RESTO DA FUNÇÃO NÃO MUDA
-- Regime, janela do contrato, ordenação e o `coalesce` final são os de
-- 20260909160000.
--
-- O MESMO DEFEITO VIVE NOUTRO SÍTIO — NÃO CORRIGIDO AQUI
-- `gerar_cobrancas_tvde_semanais` usa `cc.vigencia @> v_proximo_de::timestamptz`
-- para escolher o condutor a quem factura a renda semanal. Pelo mesmo motivo,
-- uma semana que comece no dia em que o condutor foi registado não encontra
-- condutor e a cobrança não é criada — em silêncio. Fica assinalado e por
-- decidir: mexer ali altera facturação, e isso é uma decisão de quem gere, não
-- um efeito colateral desta migração.
-- ============================================================

create or replace function public.resolver_devedor_do_cliente(
  p_org_id     uuid,
  p_cliente_id uuid,
  p_data       date
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select c.cliente_id
      from public.contrato_condutores cc
      join public.contratos_renting c on c.id = cc.contrato_id
      where cc.cliente_id = p_cliente_id
        and c.org_id = p_org_id
        and c.regime = 'rent_a_car'
        and c.deleted_at is null
        and c.estado_operacional <> 'cancelado'
        -- Sobreposição com o dia inteiro, não continência da meia-noite.
        and cc.vigencia && tstzrange(p_data::timestamptz, (p_data + 1)::timestamptz, '[)')
        -- Mesma janela de resolver_contrato_da_viatura: a versão viva à data.
        and (c.created_at at time zone 'Europe/Lisbon')::date <= p_data
        and (c.substituido_em is null
             or (c.substituido_em at time zone 'Europe/Lisbon')::date > p_data)
      order by c.created_at desc, c.id
      limit 1
    ),
    p_cliente_id
  );
$$;

comment on function public.resolver_devedor_do_cliente(uuid, uuid, date) is
  'Quem paga o que este cliente gastou naquela data: o titular do contrato rent-a-car em que ele era condutor nesse DIA, ou ele próprio se não houver nenhum.';

revoke all on function public.resolver_devedor_do_cliente(uuid, uuid, date) from public, anon;
grant execute on function public.resolver_devedor_do_cliente(uuid, uuid, date) to authenticated;

notify pgrst, 'reload schema';
