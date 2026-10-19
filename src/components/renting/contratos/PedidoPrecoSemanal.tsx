import { useState } from 'react';
import { Euro } from 'lucide-react';

import { BotaoPedirAlteracao } from './BotaoPedirAlteracao';
import { PedirAlteracaoContratoDialog } from './PedirAlteracaoContratoDialog';

interface PedidoPrecoSemanalProps {
  contratoId: string;
  /** Valor semanal em vigor no contrato — o que o pedido propõe substituir. */
  valorAtual: number;
}

/** Pedido de novo valor semanal de um TVDE ao supervisor, no cartão do resumo. */
export const PedidoPrecoSemanal: React.FC<PedidoPrecoSemanalProps> = ({
  contratoId,
  valorAtual,
}) => {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <BotaoPedirAlteracao
        contratoId={contratoId}
        tipo="preco_semana"
        label="Pedir alteração do valor semanal"
        icon={Euro}
        onClick={() => setAberto(true)}
      />
      {aberto && (
        <PedirAlteracaoContratoDialog
          open={aberto}
          onOpenChange={setAberto}
          contratoId={contratoId}
          tipo="preco_semana"
          valorAtual={valorAtual}
        />
      )}
    </>
  );
};
