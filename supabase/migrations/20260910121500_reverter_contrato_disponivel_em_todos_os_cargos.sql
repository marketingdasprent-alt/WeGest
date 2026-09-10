-- As duas permissões de reverter passam a existir em TODOS os cargos.
--
-- Criar a linha em `recursos` não chega: o ecrã de Permissões mostra o que
-- existe em `cargo_permissoes` para aquele cargo, e sem linha o toggle nem
-- aparece. contratos_reverter_abertura só existia no cargo Faturação (foi
-- onde nasceu, a testar) e contratos_reverter_reserva faltava em metade dos
-- cargos — Financeiro, Gestor TVDE, Mecânicos, Motorista, Supervisor Gestor
-- TVDE, Transferista.
--
-- Ficam a FALSE: a permissão passa a estar disponível para se ligar, não
-- ligada. Quem já a tinha mantém-na — o INSERT só cria o que falta.
--
-- Para todos os cargos de todas as organizações, não só a Década: é uma
-- permissão do produto, não a configuração de um cliente.

INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, pode_editar, org_id)
SELECT c.id, r.id, false, false, c.org_id
FROM public.cargos c
CROSS JOIN public.recursos r
WHERE r.nome IN ('contratos_reverter_abertura', 'contratos_reverter_reserva')
  AND NOT EXISTS (
    SELECT 1 FROM public.cargo_permissoes cp
     WHERE cp.cargo_id = c.id AND cp.recurso_id = r.id
  );
