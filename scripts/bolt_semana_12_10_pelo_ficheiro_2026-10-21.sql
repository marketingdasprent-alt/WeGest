-- ============================================================================
-- 4. Semana 12/10 (por pagar): os ganhos do ficheiro já importado
-- ============================================================================

create table if not exists public.zz_bolt_ficheiro_desfazer_20261021 (
  resumo_id uuid primary key,
  ganhos_brutos_app numeric, ganhos_brutos_dinheiro numeric, gorjetas numeric,
  taxas_cancelamento numeric, comissoes numeric, portagens numeric, taxas_reserva numeric,
  ganhos_liquidos numeric, pagamento_previsto numeric, fonte_viagens text,
  guardado_em timestamptz default now()
);
alter table public.zz_bolt_ficheiro_desfazer_20261021 enable row level security;
revoke all on public.zz_bolt_ficheiro_desfazer_20261021 from anon, authenticated;

insert into public.zz_bolt_ficheiro_desfazer_20261021 (
  resumo_id, ganhos_brutos_app, ganhos_brutos_dinheiro, gorjetas, taxas_cancelamento,
  comissoes, portagens, taxas_reserva, ganhos_liquidos, pagamento_previsto, fonte_viagens
)
select r.id, r.ganhos_brutos_app, r.ganhos_brutos_dinheiro, r.gorjetas, r.taxas_cancelamento,
       r.comissoes, r.portagens, r.taxas_reserva, r.ganhos_liquidos, r.pagamento_previsto, r.fonte_viagens
  from public.bolt_resumos_semanais r
 where r.periodo_inicio = '2026-10-12'
   and r.fonte_viagens = 'api'
   and coalesce(r.raw_data ? 'Ganhos líquidos|€', false)
on conflict (resumo_id) do nothing;

update public.bolt_resumos_semanais r set
  ganhos_brutos_app      = public.bolt_csv_numero(r.raw_data ->> 'Ganhos brutos (pagamentos na app)|€'),
  ganhos_brutos_dinheiro = public.bolt_csv_numero(r.raw_data ->> 'Ganhos brutos (pagamentos em dinheiro)|€'),
  gorjetas               = public.bolt_csv_numero(r.raw_data ->> 'Gorjetas dos passageiros|€'),
  taxas_cancelamento     = public.bolt_csv_numero(r.raw_data ->> 'Taxas de cancelamento|€'),
  comissoes              = public.bolt_csv_numero(r.raw_data ->> 'Comissões|€'),
  portagens              = public.bolt_csv_numero(r.raw_data ->> 'Portagens|€'),
  taxas_reserva          = public.bolt_csv_numero(r.raw_data ->> 'Taxas de reserva|€'),
  ganhos_liquidos        = public.bolt_csv_numero(r.raw_data ->> 'Ganhos líquidos|€'),
  pagamento_previsto     = public.bolt_csv_numero(r.raw_data ->> 'Pagamento previsto|€'),
  fonte_viagens          = 'csv',
  updated_at             = now()
 where r.id in (select resumo_id from public.zz_bolt_ficheiro_desfazer_20261021);

select public.bolt_resumo_recalcular_total(resumo_id) from public.zz_bolt_ficheiro_desfazer_20261021;

