-- ============================================================================
-- A vista de estatísticas ganha grupo_id e acao_tipo
-- ============================================================================
--
-- Sem isto, a lista não sabe quais regras são a mesma automação nem que
-- tipo de acção cada uma dispara, para mostrar o badge "também envia
-- email".
-- ============================================================================

-- `CREATE OR REPLACE VIEW` só aceita ACRESCENTAR colunas no fim da lista —
-- inserir grupo_id/acao_tipo a meio lê-se como "renomear" as colunas
-- seguintes, e o Postgres recusa. Ficam depois de duracao_media_ms.
create or replace view public.automacao_estatisticas_por_regra as
select
    aru.id as rule_id,
    aru.org_id,
    aru.nome,
    aru.event_type,
    aru.ativo,
    aru.cooldown_minutos,
    count(al.id) filter (where al.evento = 'executada') as execucoes,
    count(al.id) filter (where al.evento = 'falhou') as falhas,
    max(al.created_at) as ultima_execucao,
    avg(al.duracao_ms) filter (where al.evento = 'executada') as duracao_media_ms,
    aru.grupo_id,
    aru.acao_tipo
from automation_rules aru
left join automation_logs al on al.rule_id = aru.id
group by aru.id, aru.org_id, aru.nome, aru.event_type, aru.ativo, aru.cooldown_minutos, aru.grupo_id, aru.acao_tipo;
