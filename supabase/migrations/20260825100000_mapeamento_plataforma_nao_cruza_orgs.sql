-- ============================================================
-- Um motorista de plataforma nunca pode apontar para ficha de outra empresa
-- ============================================================
-- O QUE CORREU MAL
-- A 25/08/2026 a Premium Ride reclamou que os motoristas apareciam "separados
-- em dois". Estavam pior do que separados: quatro linhas de `uber_drivers` da
-- Premium Ride apontavam para fichas da Década Ousada —
--
--   Hugo Ricardo Pinho Palma, Kuldeep Singh, Rakesh Kumar, Paulo Jorge Silva
--
-- — e com elas foram 7 `uber_transactions` para a conta-corrente da empresa
-- errada. Como a ficha da Premium ficava a zero, alguém criava outra à mão
-- (daí "dois Hugos"), com gralhas que tornavam o problema invisível à procura
-- por nome: "Hugo Ricardo Pinha Palma", "Kudeep Singh".
--
-- A CAUSA
-- Duas, uma por cima da outra:
--
--   1. O botão "Sincronizar IDs" (useMotoristasPlataformaSync.ts) cruzava
--      motoristas com drivers sem filtrar por org. Quem tem acesso às duas
--      empresas via as duas listas, e o casamento por nome saía trocado.
--      Corrigido no mesmo dia, do lado do frontend.
--
--   2. Nada na base o impedia. `uber_drivers` até já tem `org_id` e um trigger
--      que recusa NULL (fn_reject_null_org_id), mas ninguém verificava se esse
--      org_id batia certo com o do motorista apontado.
--
-- Esta migração trata do ponto 2 — a defesa que não depende de o frontend
-- estar bem escrito. É precisa porque o cruzamento por nome não tem
-- alternativa: das 359 linhas de `uber_drivers`, ZERO têm email ou telefone.
-- A Uber só manda o nome. Se o único critério é frágil, o limite tem de ser
-- rígido.
--
-- NOTA: a mesma pessoa PODE e DEVE ter uma ficha em cada empresa — são
-- contas-correntes independentes (Hugo conduz para as duas). O que se proíbe
-- não é a pessoa repetida, é a LIGAÇÃO cruzada.
--
-- Idempotente e aditiva.
--
-- COMO APLICAR: colar no SQL Editor. Este projeto não tem o CLI da Supabase.

create or replace function public.fn_mapeamento_mesma_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org_motorista uuid;
begin
  if new.motorista_id is null then
    return new;
  end if;

  select m.org_id into v_org_motorista
  from public.motoristas_ativos m
  where m.id = new.motorista_id;

  if v_org_motorista is null then
    raise exception
      'Motorista % não existe — ligação recusada (tabela %).',
      new.motorista_id, tg_table_name
      using errcode = 'foreign_key_violation';
  end if;

  if new.org_id is distinct from v_org_motorista then
    raise exception
      'Ligação entre empresas recusada: linha da org % a apontar para motorista da org % (tabela %, motorista %). Cada empresa tem de ter a sua própria ficha.',
      new.org_id, v_org_motorista, tg_table_name, new.motorista_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

comment on function public.fn_mapeamento_mesma_org() is
  'Recusa mapeamentos plataforma->motorista em que a linha e a ficha do motorista pertencem a organizações diferentes. Ver incidente Premium Ride/Década Ousada de 25/08/2026.';

revoke all on function public.fn_mapeamento_mesma_org() from public, anon, authenticated;

drop trigger if exists trg_uber_drivers_mesma_org on public.uber_drivers;
create trigger trg_uber_drivers_mesma_org
  before insert or update of motorista_id, org_id on public.uber_drivers
  for each row execute function public.fn_mapeamento_mesma_org();

drop trigger if exists trg_bolt_mapeamento_mesma_org on public.bolt_mapeamento_motoristas;
create trigger trg_bolt_mapeamento_mesma_org
  before insert or update of motorista_id, org_id on public.bolt_mapeamento_motoristas
  for each row execute function public.fn_mapeamento_mesma_org();

drop trigger if exists trg_bolt_drivers_mesma_org on public.bolt_drivers;
create trigger trg_bolt_drivers_mesma_org
  before insert or update of motorista_id, org_id on public.bolt_drivers
  for each row execute function public.fn_mapeamento_mesma_org();

-- ── Verificação ───────────────────────────────────────────────────────────
-- Os dados foram reparados a 25/08 antes de o trigger entrar. Estas três
-- queries têm de devolver zero linhas; se devolverem alguma, o trigger vai
-- recusar o próximo update dessa linha e é preciso repará-la primeiro.
do $verifica$
declare
  v_mau integer;
begin
  select count(*) into v_mau from (
    select 1 from public.uber_drivers u
      join public.motoristas_ativos m on m.id = u.motorista_id
      where u.org_id is distinct from m.org_id
    union all
    select 1 from public.bolt_mapeamento_motoristas b
      join public.motoristas_ativos m on m.id = b.motorista_id
      where b.org_id is distinct from m.org_id
    union all
    select 1 from public.bolt_drivers d
      join public.motoristas_ativos m on m.id = d.motorista_id
      where d.org_id is distinct from m.org_id
  ) x;

  if v_mau > 0 then
    raise warning 'Ainda existem % ligações entre empresas por reparar.', v_mau;
  else
    raise notice 'Sem ligações entre empresas. Trigger activo.';
  end if;
end;
$verifica$;
