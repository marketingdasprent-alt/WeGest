-- O login do portal deixa de partilhar colunas com as credenciais da API.
--
-- PORQUÊ
-- Uma integração Bolt guardava o login do portal em client_id/client_secret.
-- Converter a conta para a API oficial escrevia as chaves da API NAS MESMAS
-- COLUNAS — e o robô Apify, que faz login no portal com esses valores, deixou
-- de conseguir entrar. Foi o que aconteceu às 4 contas da Década Ousada a
-- 2026-08-04: a última passagem do robô é de 2026-08-10 e desde aí não entra
-- um único CSV.
--
-- O CSV não é um luxo: a API da Bolt (getFleetOrders → OrderPriceData) tem
-- exactamente 9 campos de preço e NENHUM deles é campanha. As campanhas são
-- pagas por semana ao motorista, não por viagem, e só existem no relatório do
-- portal. Confirmado ao cêntimo: Abraão Freitas, semana 01-07/09, API
-- 198,52 EUR contra 208,50 EUR no CSV — a diferença de 10,00 EUR é a coluna
-- "Campanhas". Sem robô, cada motorista recebe a menos o valor das campanhas.
--
-- Ver o comentário da RPC bolt_resumo_merge_api: "a API é dona das viagens e
-- do líquido; o CSV é dono de ganhos_campanha e reembolsos_despesas".
--
-- O QUE MUDA
-- O login do portal passa a ter colunas próprias. As duas fontes deixam de
-- competir pelo mesmo sítio e passam a poder coexistir na mesma integração:
-- a API traz as viagens todas as segundas, o robô traz o CSV com as campanhas.
--
-- Idempotente e aditiva: nenhuma coluna existente é tocada.

ALTER TABLE public.plataformas_configuracao
  ADD COLUMN IF NOT EXISTS robot_portal_email text,
  ADD COLUMN IF NOT EXISTS robot_portal_password text;

COMMENT ON COLUMN public.plataformas_configuracao.robot_portal_email IS
  'Login do portal da plataforma (ex: fleets.bolt.eu) usado pelo robô Apify. '
  'Separado de client_id, que em auth_mode=oauth guarda a chave da API oficial. '
  'Sem esta separação, converter para a API apagava o login e o robô deixava de entrar.';

COMMENT ON COLUMN public.plataformas_configuracao.robot_portal_password IS
  'Password do portal da plataforma, par de robot_portal_email. Separada de '
  'client_secret pelo mesmo motivo.';

-- Contas ainda em modo robô: o login do portal está em client_id/client_secret
-- e continua válido. Copiá-lo para as colunas novas mantém o robô a correr sem
-- interrupção e faz aparecer o que já lá está no ecrã novo, em vez de mostrar
-- campos vazios a quem nunca mexeu em nada.
--
-- Só se copia quando o destino está vazio (nunca sobrepõe) e quando a conta NÃO
-- está em oauth — numa conta convertida, client_id já é a chave da API e copiá-la
-- para cá só ia gravar um "login" que nunca vai funcionar.
UPDATE public.plataformas_configuracao
SET robot_portal_email = client_id,
    robot_portal_password = client_secret
WHERE plataforma = 'robot'
  AND coalesce(auth_mode, 'password') <> 'oauth'
  AND robot_portal_email IS NULL
  AND robot_portal_password IS NULL
  AND client_id IS NOT NULL
  AND client_secret IS NOT NULL;
