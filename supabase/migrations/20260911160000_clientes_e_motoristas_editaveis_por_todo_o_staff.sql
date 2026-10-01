-- Clientes e motoristas passam a ser editáveis por todo o staff.
--
-- Decisão de produto (11/09): "que dê para mudar infos de clientes e
-- motoristas sempre, e que qualquer pessoa consiga fazer isso". O caso que
-- a motivou — a Ivone "não conseguir alterar um email" — afinal gravava
-- (updated_by dela às 15:04 desse dia); mas a regra que ficou decidida é que
-- ninguém do staff deve esbarrar aqui, em nenhuma organização.
--
-- NÃO HÁ CÓDIGO A MUDAR. Nas duas entidades a alavanca é uma só:
--   · as rotas /renting/clientes/* e /motoristas/* exigem o recurso;
--   · a RLS de UPDATE (clientes_update via has_renting_access;
--     mt_motoristas_ativos_update via has_permission) exige o mesmo recurso.
-- Ligar o toggle abre as duas portas. Fica reversível cargo a cargo no ecrã
-- de Permissões — foi pedido manter o toggle, não tirá-lo.
--
-- EXCLUI O CARGO "Motorista", de propósito. São os condutores que entram
-- pelo portal (70 na Década Ousada). Dar-lhes motoristas_gestao abria-lhes a
-- lista e a edição de TODOS os motoristas e clientes, não só os próprios
-- dados — que continuam a ver pela política "Motoristas podem ver seus
-- próprios dados". Decisão confirmada: só o staff.
--
-- Idempotente: cria o que falta a true e liga o que existe a false. Correr
-- duas vezes não faz nada à segunda.

-- 1) Linhas que faltam: nascem já ligadas.
INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, pode_editar, org_id)
SELECT c.id, r.id, true, true, c.org_id
  FROM public.cargos c
  CROSS JOIN public.recursos r
 WHERE r.nome IN ('renting_clientes', 'motoristas_gestao')
   AND c.nome <> 'Motorista'
   AND NOT EXISTS (
     SELECT 1 FROM public.cargo_permissoes cp
      WHERE cp.cargo_id = c.id AND cp.recurso_id = r.id
   );

-- 2) Linhas que existem desligadas: ligam-se.
UPDATE public.cargo_permissoes cp
   SET tem_acesso = true,
       pode_editar = true
  FROM public.cargos c, public.recursos r
 WHERE cp.cargo_id = c.id
   AND cp.recurso_id = r.id
   AND r.nome IN ('renting_clientes', 'motoristas_gestao')
   AND c.nome <> 'Motorista'
   AND (cp.tem_acesso IS DISTINCT FROM true OR cp.pode_editar IS DISTINCT FROM true);
