-- ============================================================
-- Bolt: arrumar os resumos "sem dono"
-- ============================================================
-- Havia 534 resumos com motorista_id NULL, contados como se fossem 534
-- ligações à mão à espera de alguém. Não eram. Ao olhar, são três coisas:
--
--   403  linhas VAZIAS      — sem nome, sem email, sem telefone, sem
--                             identificador, sem chave, e 0,00 EUR em tudo.
--                             fonte_viagens e fonte_extras a NULL, ou seja
--                             não foram escritas nem pelo caminho da API nem
--                             pelo do CSV: são restos de antes da migração
--                             20260804140000, criados entre Abril e Julho.
--                             Uma delas ainda usa o formato de período
--                             antigo '2026W13'. Não há ali ninguém para
--                             ligar — apagam-se.
--
--    14  linhas cujo uuid JÁ está mapeado a uma ficha em
--        bolt_mapeamento_motoristas (785,72 EUR). O mapeamento existe; o
--        resumo é que nunca recebeu o motorista_id. Elo em falta, não
--        dúvida — liga-se sozinho.
--
--   117  linhas / 22 identidades desconhecidas (6.848,12 EUR). FICAM. 14
--        delas têm 0,00 EUR e 5 pertencem a gente sem ficha nenhuma no
--        WeGest. As três que valem dinheiro a sério — João Varela 3.967,50,
--        Fernando Pereira 1.346,02, Ketan Arora 1.004,20, todas na Bolt
--        Urbango — só se ligam pelo NOME, e foi o match por nome que criou
--        as 18 identidades duplicadas corrigidas em 20260812130000. Essas
--        decidem-se uma a uma, no botão da ficha.
--
-- Idempotente: correr duas vezes não faz nada da segunda vez.
-- ============================================================

-- 1) O uuid já sabe a quem pertence: aplicar ao resumo.
UPDATE public.bolt_resumos_semanais r
   SET motorista_id = m.motorista_id,
       updated_at   = now()
  FROM public.bolt_mapeamento_motoristas m
 WHERE r.motorista_id IS NULL
   AND r.identificador_motorista IS NOT NULL
   AND m.driver_uuid = r.identificador_motorista
   AND m.motorista_id IS NOT NULL;

-- 2) As linhas que não identificam ninguém e não carregam nada.
--    A lista de condições é longa de propósito: cada coluna de dinheiro está
--    aqui para que uma linha com QUALQUER valor sobreviva a este DELETE.
DELETE FROM public.bolt_resumos_semanais r
 WHERE r.motorista_id IS NULL
   AND r.identificador_motorista IS NULL
   AND r.chave_motorista IS NULL
   AND r.motorista_nome IS NULL
   AND r.email IS NULL
   AND r.telefone IS NULL
   AND r.fonte_viagens IS NULL
   AND r.fonte_extras IS NULL
   AND COALESCE(r.ganhos_liquidos, 0)        = 0
   AND COALESCE(r.pagamento_previsto, 0)     = 0
   AND COALESCE(r.ganhos_brutos_app, 0)      = 0
   AND COALESCE(r.ganhos_brutos_dinheiro, 0) = 0
   AND COALESCE(r.ganhos_campanha, 0)        = 0
   AND COALESCE(r.reembolsos_despesas, 0)    = 0
   AND COALESCE(r.gorjetas, 0)               = 0
   AND COALESCE(r.taxas_cancelamento, 0)     = 0
   AND COALESCE(r.comissoes, 0)              = 0
   AND COALESCE(r.viagens_terminadas, 0)     = 0
   AND COALESCE(r.api_net_earnings, 0)       = 0;

-- Resultado em produção a 2026-08-14:
--   14 resumos ligados (785,72 EUR) a Juliana Severino, Eduardo Ramos,
--      Wagno Silva e Adalberto Junior
--   403 linhas vazias apagadas
--   sem dono: 534 -> 117 · identidades por ligar: 26 -> 22
--   totais intactos: API 1.012.844,92 EUR · campanhas 20.457,77 EUR
