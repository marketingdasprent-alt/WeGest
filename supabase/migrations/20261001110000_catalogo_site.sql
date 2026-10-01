-- ============================================================
-- Catálogo do site de rent-a-car: características no modelo, estações, tarifa
-- ============================================================
-- O site mostra modelos ("Clio ou similar"), não matrículas. Caixa, lugares,
-- portas, bagageira e foto vivem por isso no modelo, preenchidos uma vez.
-- ============================================================

alter table public.viatura_modelos
  add column if not exists caixa text check (caixa in ('manual', 'automatica')),
  add column if not exists lugares smallint check (lugares between 1 and 9),
  add column if not exists portas smallint check (portas between 2 and 6),
  add column if not exists bagageira smallint check (bagageira between 0 and 10),
  add column if not exists ar_condicionado boolean not null default true,
  add column if not exists imagem_url text;

alter table public.estacoes
  add column if not exists horario text,
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6);

alter table public.renting_tarifas
  add column if not exists tarifa_site boolean not null default false;

-- Uma tarifa do site activa por organização; é a única que a API lê.
create unique index if not exists renting_tarifas_site_unica
  on public.renting_tarifas (org_id) where tarifa_site and ativa;

comment on column public.renting_tarifas.tarifa_site is
  'Tarifa cujos preços por modelo a API externa de rent-a-car publica. Uma activa por organização.';

-- Bucket público só para fotos de marketing dos modelos (nunca fotos de matrículas).
-- Os ficheiros ficam em modelos-viaturas/<org_id>/<modelo_id>.<ext>.
insert into storage.buckets (id, name, public)
values ('modelos-viaturas', 'modelos-viaturas', true)
on conflict (id) do nothing;

drop policy if exists modelos_viaturas_leitura on storage.objects;
create policy modelos_viaturas_leitura on storage.objects for select
  using (bucket_id = 'modelos-viaturas');
drop policy if exists modelos_viaturas_escrita on storage.objects;
create policy modelos_viaturas_escrita on storage.objects for insert to authenticated
  with check (bucket_id = 'modelos-viaturas'
              and (storage.foldername(name))[1] = public.get_current_org_id()::text
              and public.is_current_user_admin());
drop policy if exists modelos_viaturas_alterar on storage.objects;
create policy modelos_viaturas_alterar on storage.objects for update to authenticated
  using (bucket_id = 'modelos-viaturas'
         and (storage.foldername(name))[1] = public.get_current_org_id()::text
         and public.is_current_user_admin());
drop policy if exists modelos_viaturas_apagar on storage.objects;
create policy modelos_viaturas_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'modelos-viaturas'
         and (storage.foldername(name))[1] = public.get_current_org_id()::text
         and public.is_current_user_admin());

notify pgrst, 'reload schema';
