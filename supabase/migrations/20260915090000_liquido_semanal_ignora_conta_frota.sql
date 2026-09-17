-- O líquido semanal recusa a ficha da própria empresa — na BD, porque a app
-- em produção ainda a grava.
--
-- O QUE ACONTECEU
-- A 14/09 a migração 20260914160000 apagou os 2 líquidos da ficha "PREMIUM
-- RIDE" (org PREMIUM RIDE). A 15/09 às 08:21 um utilizador dessa org abriu a
-- lista de Contas na semana 07–13/09 e a app — a versão em produção, sem a
-- correção de useContasResumoSemana — casou outra vez o resumo Uber "PREMIUM
-- RIDE, LDA" com a ficha pelo nome e gravou-lhe -6 948,93 € de novo. Vai
-- acontecer sempre que alguém abrir aquela semana até o código chegar a prod.
--
-- PORQUÊ NA BD E NÃO SÓ NO CÓDIGO
-- A tabela tem um único escritor (a lista de Contas), mas esse escritor tem
-- versões: a que está nos browsers hoje, a que vai ser deployada, a que
-- alguém escreve daqui a seis meses sem saber desta história. A regra "a
-- conta da frota não tem conta corrente" é da BD.
--
-- PORQUÊ IGNORAR EM VEZ DE RECUSAR
-- A lista grava TODOS os motoristas da semana num único upsert. Um RAISE
-- aqui desfazia a gravação dos outros 32 motoristas da PREMIUM RIDE para
-- travar uma linha — e o ecrã só dizia "falha ao gravar em lote". O gatilho
-- devolve NULL: a linha da empresa não entra, as outras entram, ninguém dá
-- por nada. (Já nos aconteceu um gatilho que falha desfazer a acção do
-- utilizador: os tickets TVDE a 25/08.)
--
-- COMO SE RECONHECE A FICHA DA EMPRESA
-- Mesma regra da 20260914160000: na mesma org existe uma conta da frota
-- (uber_drivers.is_conta_frota) cujo nome começa pelo nome da ficha
-- ("PREMIUM RIDE, LDA" ⊃ "PREMIUM RIDE"), ou a ficha aponta directamente a
-- essa conta pelo uber_uuid.

CREATE OR REPLACE FUNCTION public.ficha_e_conta_frota(p_motorista_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.motoristas_ativos m
      JOIN public.uber_drivers d
        ON d.org_id = m.org_id
       AND d.is_conta_frota
       AND d.uber_driver_id IS NOT NULL
     WHERE m.id = p_motorista_id
       AND (
         m.uber_uuid = d.uber_driver_id
         OR (
           length(regexp_replace(m.nome, '[^[:alnum:]]', '', 'g')) >= 5
           AND lower(regexp_replace(coalesce(d.full_name, ''), '[^[:alnum:]]', '', 'g'))
               LIKE lower(regexp_replace(m.nome, '[^[:alnum:]]', '', 'g')) || '%'
         )
       )
  );
$$;

COMMENT ON FUNCTION public.ficha_e_conta_frota(uuid) IS
  'Verdadeiro quando a ficha de motorista é, na realidade, a conta da própria empresa na Uber (a que recebe as transferências semanais): ou aponta a uma conta is_conta_frota da mesma org, ou tem o nome dela. Uma ficha assim não tem conta corrente.';

REVOKE ALL ON FUNCTION public.ficha_e_conta_frota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ficha_e_conta_frota(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.liquido_semanal_ignora_conta_frota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.ficha_e_conta_frota(NEW.motorista_id) THEN
    RETURN NULL;  -- a linha não entra; o resto do lote segue
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.liquido_semanal_ignora_conta_frota() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_liquido_semanal_ignora_conta_frota ON public.motorista_liquido_semanal;
CREATE TRIGGER trg_liquido_semanal_ignora_conta_frota
BEFORE INSERT OR UPDATE ON public.motorista_liquido_semanal
FOR EACH ROW
EXECUTE FUNCTION public.liquido_semanal_ignora_conta_frota();

-- O que voltou a entrar entre a 20260914160000 e este gatilho. Só o que tem
-- movimento pendente — uma cobrança já registada é para rever à mão.
DELETE FROM public.motorista_liquido_semanal l
 WHERE public.ficha_e_conta_frota(l.motorista_id)
   AND NOT EXISTS (
     SELECT 1 FROM public.motorista_financeiro mf
      WHERE mf.liquido_semanal_id = l.id AND mf.status <> 'pendente'
   );

NOTIFY pgrst, 'reload schema';
