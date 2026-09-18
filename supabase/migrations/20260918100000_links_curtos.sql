-- Links curtos para ficheiros do storage.
--
-- Nasceu do resumo financeiro enviado por WhatsApp: o URL assinado do Supabase
-- leva um JWT de ~300 caracteres e ocupava metade da mensagem. Aqui guarda-se
-- o destino e devolve-se um código curto; quem abre `wegest.pt/r/<codigo>` é
-- reencaminhado por uma edge function que assina o ficheiro na hora.
--
-- O código É a credencial: quem o tiver abre o ficheiro sem sessão. Por isso
-- tem entropia a sério (12 caracteres de alfabeto sem ambiguidades ≈ 60 bits,
-- fora de alcance de adivinhação) e validade obrigatória.

create table if not exists public.links_curtos (
  codigo text primary key,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  bucket text not null,
  caminho text not null,
  expira_em timestamptz not null,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  -- Só para se perceber, mais tarde, se um link andou a circular.
  aberturas integer not null default 0,
  ultima_abertura timestamptz,
  constraint links_curtos_codigo_formato check (codigo ~ '^[A-Za-z0-9]{8,32}$'),
  constraint links_curtos_validade check (expira_em > criado_em)
);

comment on table public.links_curtos is
  'Códigos curtos que apontam para ficheiros privados do storage. Resolvidos pela edge function link-curto, que assina o URL na altura em que o link é aberto.';

create index if not exists links_curtos_org_idx on public.links_curtos (org_id);
-- Para a limpeza dos expirados não varrer a tabela toda.
create index if not exists links_curtos_expira_idx on public.links_curtos (expira_em);

alter table public.links_curtos enable row level security;

-- Quem trabalha na organização cria links para os ficheiros dela. A leitura
-- pela via pública NÃO passa por aqui: a edge function usa a service role, que
-- ignora o RLS. Esta política existe para a aplicação poder rever e revogar os
-- links que criou.
drop policy if exists links_curtos_membros_leem on public.links_curtos;
create policy links_curtos_membros_leem
  on public.links_curtos for select
  using (org_id = public.get_current_org_id());

drop policy if exists links_curtos_membros_criam on public.links_curtos;
create policy links_curtos_membros_criam
  on public.links_curtos for insert
  with check (org_id = public.get_current_org_id());

-- Revogar um link é apagá-lo; alterar o destino de um link já enviado não é
-- uma operação que faça sentido, por isso não há update.
drop policy if exists links_curtos_membros_apagam on public.links_curtos;
create policy links_curtos_membros_apagam
  on public.links_curtos for delete
  using (org_id = public.get_current_org_id());

-- Um link expirado não tem porque continuar guardado: deixa de funcionar e o
-- que sobra é o registo de para onde apontava. Corre no cron diário existente.
create or replace function public.limpar_links_curtos_expirados()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removidos integer;
begin
  delete from public.links_curtos
   where expira_em < now() - interval '30 days';
  get diagnostics removidos = row_count;
  return removidos;
end;
$$;

revoke all on function public.limpar_links_curtos_expirados() from public;
grant execute on function public.limpar_links_curtos_expirados() to service_role;
