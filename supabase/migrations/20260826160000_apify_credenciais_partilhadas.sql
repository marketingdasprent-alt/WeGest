-- O token Apify não é por-organização — é a mesma conta Apify (do WeGest) a
-- correr os robôs de todas as empresas. Até agora cada org só conseguia criar
-- uma integração Uber/BP/Repsol/EDP/Via Verde nova se já tivesse, ELA
-- PRÓPRIA, uma integração anterior da mesma plataforma com token preenchido
-- (lookup restrito por RLS a plataformas_configuracao.org_id) — daí o erro
-- "Não há nenhum token Apify configurado" em orgs novas ou em plataformas
-- ainda não usadas nessa org.
--
-- Esta tabela guarda a credencial partilhada uma única vez por plataforma,
-- sem org_id, e sem policy nenhuma (RLS ligada, zero policies = só o
-- service_role, usado pela edge function apify-credenciais-partilhadas, lhe
-- consegue aceder — nunca o browser).
create table public.apify_credenciais_partilhadas (
  robot_target_platform text primary key,
  apify_actor_id text not null,
  apify_api_token text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.apify_credenciais_partilhadas enable row level security;

-- SEM seed de dados aqui de propósito — apify_api_token é um segredo real e
-- este ficheiro vai para o histórico do git. Os valores de produção foram
-- inseridos diretamente na BD (fora do git, via MCP/dashboard do Supabase) e
-- não noutro sítio.
--
-- Para provisionar um ambiente novo, inserir manualmente uma linha por
-- robot_target_platform (bolt, viaverde, uber, repsol, edp, bp) com o
-- apify_actor_id e o apify_api_token corretos — um actor Apify só é acessível
-- pelo token da conta onde foi criado (ver comentário em BOLT_DEFAULTS,
-- integracoes/types.ts: "o token partilhado antigo não tem acesso a este
-- actor (404)"), por isso bolt/viaverde usam uma conta e uber/repsol/edp/bp
-- outra — confirmar sempre o par (actor_id, token) certo antes de inserir.
