-- ============================================================
-- Assinaturas: o link não expira, mas é de uma só utilização
-- ============================================================
-- Duas coisas separadas, e a distinção é o desenho todo. O TEMPO deixou de
-- fechar o link: um pedido de há três meses continua a poder ser assinado, e
-- antes um prazo esgotado obrigava a criar um pedido novo só para corrigir um
-- traço mal dado. Uma ASSINATURA fecha-o: cada pedido aceita uma, e acabou.
--
-- Repetir faz-se do outro lado. Quem trata do contrato envia um pedido novo,
-- que gera um link novo — também sem prazo, também de uma utilização. Quando
-- esse for assinado, é essa a assinatura que vale; a anterior fica história e
-- aparece marcada como substituída.
--
-- Assim, um link que corra mundo não dá a ninguém o poder de reassinar o
-- documento mais tarde: para haver assinatura nova, tem de partir de dentro.
--
-- A coluna `assinaturas_total` foi criada hoje para um desenho anterior, em que
-- o mesmo link aceitava assinaturas repetidas. Nesse desenho fazia sentido
-- contar quantas; neste não faz — cada pedido tem no máximo uma, e `assinado_em`
-- já diz tudo. Sai, para o esquema não guardar uma pergunta que já não se faz.
ALTER TABLE public.documento_assinatura_pedidos
  DROP COLUMN IF EXISTS assinaturas_total;

COMMENT ON COLUMN public.documento_assinatura_pedidos.expires_at IS
  'Data que era o prazo do link. Deixou de ser aplicada: o link nao expira. O '
  'que fecha o link e ser usado -- cada pedido aceita UMA assinatura. Para '
  'assinar outra vez cria-se um pedido novo, com link novo, e a assinatura '
  'desse passa a ser a que vale.';
