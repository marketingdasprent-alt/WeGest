-- Corrige o bug de ordem de gatilhos em organizacoes: os gatilhos
-- AFTER INSERT disparam por ordem alfabética do nome
-- (trg_organizacoes_create_definicoes, trg_organizacoes_seed_automacao,
-- trigger_auto_create_admin_cargo, ...), o que faz
-- trg_organizacoes_seed_automacao() (chama seed_automacao_defaults())
-- disparar ANTES de trigger_auto_create_admin_cargo() (chama
-- ensure_base_cargos(), que cria Administrador/Gestor TVDE/Supervisor
-- Gestor TVDE). Resultado: toda organização nova ficava com as regras
-- de automação "cargo" seedadas com destinatarios_cargo_ids vazio,
-- porque a cargo "Gestor TVDE" ainda não existia no momento do lookup.
--
-- Fix: a própria trigger function de seed_automacao garante os cargos
-- base primeiro (ensure_base_cargos é idempotente — verifica existência
-- antes de inserir cada cargo), removendo a dependência da ordem entre
-- os dois triggers.

create or replace function public.trg_organizacoes_seed_automacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_base_cargos(new.id);
  perform public.seed_automacao_defaults(new.id);
  return new;
end;
$$;
