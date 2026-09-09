-- ============================================================
-- O combustível de rent-a-car segue o CONTRATO, não o portador do cartão
-- ============================================================
-- A REGRA (decidida a 2026-09-09)
--   Quem paga é o TITULAR do contrato onde o condutor está vigente.
--   · Condutor é o próprio titular  → a conta é dele.
--   · Condutor é outro             → a conta é do cliente do contrato.
-- É a mesma regra que 20260826120000 escreveu para as portagens ("regra do
-- Thiago"), aqui ancorada no cartão em vez da matrícula.
--
-- PORQUE SÓ MEXE NO RAMO DO CLIENTE
-- Os dois regimes não se cruzam nos dados: em `contrato_condutores`, os 54
-- condutores de rent_a_car são TODOS registos em `clientes` (zero motoristas) e
-- os 183 de TVDE são TODOS motoristas (zero clientes). Por construção, um
-- cartão cujo titular é motorista é TVDE — e esse continua a pagar o que gasta,
-- pelo extrato, exactamente como hoje. Esta migração não lhe toca.
--
-- DUAS COLUNAS, NÃO UMA
--   `cliente_id`         — quem GASTOU (posto por 20260909150000)
--   `devedor_cliente_id` — quem PAGA
-- São perguntas diferentes e ambas interessam: sem a primeira, a AFSS Formação
-- recebe a conta sem saber que foi o Márcio que atestou. Mesmo par que a Via
-- Verde usa com `cliente_id` + `imputado_motorista_id`.
--
-- A JANELA DO CONTRATO
-- Copiada de `resolver_contrato_da_viatura`, de propósito: se o combustível e
-- as portagens usassem definições diferentes de "que contrato estava vivo
-- naquele dia", os dois relatórios discordariam sobre o mesmo dia. Herda a
-- limitação conhecida — um contrato `fechado` que nunca foi substituído
-- continua a contar. `contratos_renting.data_fim` não serve para corrigir isso:
-- há contratos `em_curso` com fim em 2025-12-01.
--
-- LIMITAÇÃO ASSUMIDA
-- Nenhuma linha de `contrato_condutores` tem `data_fim` (717 em 717), por isso
-- a vigência do condutor nunca fecha. Quem bounda o resultado é a janela do
-- contrato, não a do condutor.
--
-- CLIENTES DUPLICADOS
-- Há 14 nomes repetidos em 29 registos de `clientes` — em 3 dos 8 contratos
-- rent_a_car com condutor ≠ titular é a mesma pessoa em dois registos. A regra
-- lida bem com isso por acidente feliz: manda sempre para o TITULAR, que é o
-- registo que tem as facturas. O risco fica nos clientes com cartão e SEM
-- contrato — aí assenta no registo escolhido no dropdown.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Quem paga
-- ------------------------------------------------------------
alter table public.bp_transacoes
  add column if not exists devedor_cliente_id uuid references public.clientes(id) on delete set null;
alter table public.repsol_transacoes
  add column if not exists devedor_cliente_id uuid references public.clientes(id) on delete set null;
alter table public.edp_transacoes
  add column if not exists devedor_cliente_id uuid references public.clientes(id) on delete set null;

comment on column public.bp_transacoes.devedor_cliente_id is
  'Cliente a quem esta transacção é cobrada: o titular do contrato rent-a-car do condutor, ou o próprio se não houver contrato. Distinto de cliente_id, que é quem gastou.';
comment on column public.repsol_transacoes.devedor_cliente_id is
  'Cliente a quem esta transacção é cobrada. Ver bp_transacoes.devedor_cliente_id.';
comment on column public.edp_transacoes.devedor_cliente_id is
  'Cliente a quem esta transacção é cobrada. Ver bp_transacoes.devedor_cliente_id.';

create index if not exists bp_transacoes_devedor_idx     on public.bp_transacoes (devedor_cliente_id);
create index if not exists repsol_transacoes_devedor_idx on public.repsol_transacoes (devedor_cliente_id);
create index if not exists edp_transacoes_devedor_idx    on public.edp_transacoes (devedor_cliente_id);

-- ------------------------------------------------------------
-- 2) Resolver o devedor a partir de quem gastou
-- ------------------------------------------------------------
-- Devolve sempre alguém: sem contrato que se aplique, quem gastou paga. Nunca
-- devolve NULL para um cliente válido — deixar a transacção sem devedor era
-- perdê-la em silêncio, que é o defeito que esta série toda anda a corrigir.
create or replace function public.resolver_devedor_do_cliente(
  p_org_id    uuid,
  p_cliente_id uuid,
  p_data      date
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
        and cc.vigencia @> p_data::timestamptz
        -- Mesma janela de resolver_contrato_da_viatura: a versão viva à data.
        and (c.created_at at time zone 'Europe/Lisbon')::date <= p_data
        and (c.substituido_em is null
             or (c.substituido_em at time zone 'Europe/Lisbon')::date > p_data)
      -- A mais recente à data. Desempate estável por id: sem ele o resultado
      -- depende da ordem que a base devolver.
      order by c.created_at desc, c.id
      limit 1
    ),
    p_cliente_id
  );
$$;

comment on function public.resolver_devedor_do_cliente(uuid, uuid, date) is
  'Quem paga o que este cliente gastou naquela data: o titular do contrato rent-a-car em que ele é condutor, ou ele próprio se não houver nenhum.';

revoke all on function public.resolver_devedor_do_cliente(uuid, uuid, date) from public, anon;
grant execute on function public.resolver_devedor_do_cliente(uuid, uuid, date) to authenticated;

-- ------------------------------------------------------------
-- 3) O gatilho carimba os três campos
-- ------------------------------------------------------------
-- O devedor deriva de quem gastou, por isso segue-o em bloco: quando a guarda
-- decide manter o titular anterior, mantém também o devedor anterior. Separá-
-- los deixaria uma linha a dizer que o João gastou e a Urbango paga por um
-- contrato que já não é o dele.
create or replace function public.tg_resolver_motorista_cartao()
returns trigger
language plpgsql
as $$
declare
  v_numero text;
  r        record;
begin
  if TG_TABLE_NAME = 'bp_transacoes' then
    select bc.card_number into v_numero
    from public.bp_cartoes bc where bc.id = NEW.card_id;
  else
    v_numero := NEW.card_number;
  end if;

  select * into r from public.resolver_titular_por_cartao(
    NEW.org_id, TG_ARGV[0], v_numero, NEW.transaction_date::date
  );

  if r.motorista_id is not null
     or r.cliente_id is not null
     or TG_OP = 'INSERT'
     or public.recalculo_e_forcado() then
    NEW.motorista_id := r.motorista_id;
    NEW.cliente_id   := r.cliente_id;
    -- Só o ramo do cliente tem devedor. Titular motorista é TVDE: paga ele, e
    -- isso já vive no extrato dele, não aqui.
    NEW.devedor_cliente_id := case
      when r.cliente_id is null then null
      else public.resolver_devedor_do_cliente(
             NEW.org_id, r.cliente_id, NEW.transaction_date::date)
      end;
  else
    NEW.motorista_id       := OLD.motorista_id;
    NEW.cliente_id         := OLD.cliente_id;
    NEW.devedor_cliente_id := OLD.devedor_cliente_id;
  end if;

  return NEW;
end $$;

notify pgrst, 'reload schema';
