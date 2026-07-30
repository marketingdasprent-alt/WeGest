-- ============================================================
-- Padronizar nível de combustível: "Vazio" → "Reserva"
-- ============================================================
-- COMBUSTIVEL_NIVEL_OPTS (src/utils/combustivel.ts) passou a usar
-- "Reserva" em vez de "Vazio" (e ganhou o nível 3/8). Os registos
-- criados antes disso ficaram com "Vazio" gravado em texto livre, o
-- que fazia a folha de danos e o PDF do contrato mostrarem duas
-- escalas diferentes para a mesma coisa.
--
-- Alcance: só as colunas alimentadas por essa lista —
--   contratos_renting.combustivel_saida / combustivel_entrada
--     (check-in/check-out de renting, AnyRentDadosSaidaAlert)
--   contratos.combustivel_checkout / combustivel_checkin
--     (CheckinDadosSection no Calendário)
--
-- NÃO tocar em:
--   assistencia_tickets.combustivel_inicio/fim — escala própria e
--     minúscula (TicketClosureDialog), onde "vazio" e "reserva" são
--     opções distintas e ambas em uso;
--   *.gpl_* — GPL_OPTS mantém "Vazio";
--   movimentos.combustivel_* — smallint em oitavos.
--
-- Idempotente: correr outra vez não afecta linhas.
--
-- Deploy: aplicar à mão no SQL editor (CI não faz db push).
-- ============================================================

UPDATE public.contratos_renting
   SET combustivel_saida = 'Reserva'
 WHERE lower(trim(combustivel_saida)) = 'vazio';

UPDATE public.contratos_renting
   SET combustivel_entrada = 'Reserva'
 WHERE lower(trim(combustivel_entrada)) = 'vazio';

UPDATE public.contratos
   SET combustivel_checkout = 'Reserva'
 WHERE lower(trim(combustivel_checkout)) = 'vazio';

UPDATE public.contratos
   SET combustivel_checkin = 'Reserva'
 WHERE lower(trim(combustivel_checkin)) = 'vazio';
