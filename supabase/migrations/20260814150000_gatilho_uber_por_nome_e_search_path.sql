-- ============================================================
-- Uber: acabar com a ligação por nome que atravessa organizações
-- ============================================================
-- O QUE ESTAVA MAL
--
-- match_motorista_to_platforms é um trigger BEFORE INSERT OR UPDATE em
-- `motoristas` que tenta adivinhar a identidade Uber pelo nome:
--
--   SELECT uber_driver_id INTO found_uber_id FROM public.uber_drivers
--    WHERE motorista_id IS NULL AND (
--          unaccent(lower(full_name)) ILIKE '%' || unaccent(lower(NEW.nome)) || '%'
--       OR unaccent(lower(NEW.nome)) ILIKE '%' || unaccent(lower(full_name)) || '%')
--    LIMIT 1;
--
-- Três defeitos numa consulta:
--
--  1. SEM FILTRO DE org_id. A função é SECURITY DEFINER, portanto ignora o
--     RLS. Um motorista criado na organização A podia ficar com a identidade
--     Uber da organização B. Hoje só uma das 5 organizações tem motoristas, por
--     isso ainda não aconteceu — mas basta a segunda começar a inserir.
--
--  2. ILIKE '%...%' NOS DOIS SENTIDOS. É o mesmo match por nome que produziu
--     18 identidades Bolt duplicadas (ver 20260812130000): "Paulo Silva" casa
--     com "Paulo Silva Santos" e vice-versa.
--
--  3. LIMIT 1 SEM ORDER BY. Havendo vários candidatos, escolhe um à sorte, e
--     pode escolher outro na próxima vez.
--
-- E há um quarto problema, que sozinho já chegava: o trigger está em
-- `motoristas`, mas a aplicação lê `motoristas_ativos`. São duas tabelas
-- distintas, com ZERO ids em comum (265 linhas contra 532). O trigger grava
-- `uber_drivers.motorista_id = NEW.id` — um id que a aplicação nunca resolve.
-- Depois sync_motorista_id_to_transactions propaga esse id fantasma para
-- uber_transactions, que é dinheiro.
--
-- Hoje há 0 fantasmas em uber_transactions (a última escrita em `motoristas`
-- foi a 2026-04-14), mas o caminho continua aberto: o excel-import escreve em
-- `motoristas` e é alcançável pelo ImportExcelDialog.
--
-- A DECISÃO: apagar o trigger em vez de o consertar.
-- Consertá-lo (filtrar por org, exigir nome exacto) manteria um mecanismo que
-- produz ligações que a aplicação não consegue usar. A ligação Uber↔motorista
-- faz-se em uber_drivers.motorista_id, pela interface, contra
-- motoristas_ativos — que é onde os 259 vínculos reais estão.
--
-- A função fica, sem o trigger e com search_path fixo, para não partir nada
-- que lhe chame pelo nome. Se ninguém lhe chamar, apaga-se depois.
-- ============================================================

DROP TRIGGER IF EXISTS trigger_match_motorista_on_save ON public.motoristas;

-- ============================================================
-- search_path fixo nas funções SECURITY DEFINER que o não tinham
-- ============================================================
-- Sem `SET search_path`, uma função SECURITY DEFINER resolve os nomes das
-- tabelas pelo search_path de QUEM A CHAMA. Quem consiga criar um objecto num
-- schema que venha antes consegue fazer a função tocar na tabela errada, já
-- com privilégios elevados. É o vector clássico de escalada em Postgres e o
-- Supabase sinaliza-o como aviso de segurança.
--
-- Nenhuma destas muda de comportamento — só deixa de aceitar que lhe mudem o
-- chão debaixo dos pés.
-- ============================================================

ALTER FUNCTION public.match_motorista_to_platforms()      SET search_path = public;
ALTER FUNCTION public.sync_uber_uuid_to_motorista()       SET search_path = public;
ALTER FUNCTION public.sync_motorista_id_to_transactions() SET search_path = public;
ALTER FUNCTION public.fn_cleanup_on_evento_delete()       SET search_path = public;
ALTER FUNCTION public.log_lead_status_change()            SET search_path = public;
ALTER FUNCTION public.get_uber_platform_config(uuid)      SET search_path = public;

COMMENT ON FUNCTION public.match_motorista_to_platforms() IS
  'DESLIGADA em 2026-08-14 (migração 20260814150000). Ligava identidades Uber '
  'por nome parcial, sem filtro de organização e com LIMIT 1 sem ordenação, e '
  'gravava ids da tabela legada `motoristas` que a aplicação não resolve. A '
  'ligação faz-se em uber_drivers.motorista_id contra motoristas_ativos.';
