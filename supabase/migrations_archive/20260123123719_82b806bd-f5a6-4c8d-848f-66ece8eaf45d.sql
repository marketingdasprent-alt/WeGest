-- Adicionar nova coluna para cidade de assinatura do contrato
ALTER TABLE motoristas_ativos 
ADD COLUMN cidade_assinatura TEXT;

-- Copiar valores existentes (os dados atuais de cidade são para assinatura)
UPDATE motoristas_ativos 
SET cidade_assinatura = cidade;