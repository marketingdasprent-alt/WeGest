-- ============================================================
-- notificacoes.org_id passa a NOT NULL — fecha a porta dos avisos invisíveis
-- ============================================================
-- A policy de SELECT exige hoje `org_id = get_current_org_id()`
-- (20260730095826). Em SQL, `NULL = <qualquer coisa>` é NULL, logo falso: uma
-- linha com org_id nulo não é devolvida a NINGUÉM — nem a um admin, nem a quem
-- a criou. É um buraco negro de dados.
--
-- A coluna, porém, continuava nullable, e notificar_motorista_pendente()
-- insere `NEW.org_id` da candidatura sem qualquer verificação. Nada impedia a
-- criação da linha: só a leitura estava fechada. O desenho original tratava
-- `org_id NULL` como "intake da empresa, visível a todos os gestores"; o
-- hardening de isolamento multi-org fechou esse ramo — correctamente — mas
-- deixou a porta de entrada aberta.
--
-- Que isto é um caminho real e não teórico prova-o a migração
-- 20260605000001_fix_rls_motorista_candidaturas.sql, que existiu precisamente
-- para fazer backfill de `motorista_candidaturas.org_id` nulos.
--
-- VERIFICADO EM PRODUÇÃO ANTES DE ESCREVER (2026-08-26)
--   select count(*) from public.notificacoes where org_id is null;   → 0
--
-- Zero linhas a converter: a restrição é puramente preventiva e não pode
-- falhar por dados existentes. O bloco de verificação abaixo confirma-o de
-- novo no momento da aplicação — se entretanto tiver aparecido alguma linha,
-- a migração aborta com a contagem em vez de rebentar num ALTER TABLE opaco.
--
-- EFEITO PRÁTICO
-- A partir daqui, uma função que tente criar um aviso sem organização falha em
-- voz alta, no sítio onde o erro nasce, em vez de produzir silenciosamente uma
-- linha que ninguém voltará a ver. Num produto de compliance, um aviso que
-- desaparece em silêncio é pior do que um erro.
-- ============================================================

do $$
declare
  v_orfas integer;
begin
  select count(*) into v_orfas from public.notificacoes where org_id is null;

  if v_orfas > 0 then
    raise exception
      'Abortado: % notificações com org_id NULL. São avisos que ninguém consegue ler; decidir a que organização pertencem (ou apagá-las) ANTES de aplicar o NOT NULL.',
      v_orfas;
  end if;
end $$;

alter table public.notificacoes
  alter column org_id set not null;

comment on column public.notificacoes.org_id is
  'Organização dona do aviso. NOT NULL desde 20260826100300: a policy de SELECT exige org_id = get_current_org_id(), pelo que uma linha sem org nunca seria devolvida a ninguém.';
