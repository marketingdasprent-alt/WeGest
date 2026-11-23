import { useState } from 'react';
import { Euro } from 'lucide-react';

import { BotaoPedirAlteracao } from './BotaoPedirAlteracao';
import { PedirAlteracaoContratoDialog } from './PedirAlteracaoContratoDialog';
import { PrecoSemanalPendente } from './PrecoSemanalPendente';

interface PedidoPrecoSemanalProps {
  contratoId: string;
  /** Valor semanal que o fecho cobra hoje (acordado ou tarifa) — o que o pedido propõe substituir. */
  valorAtual: number | null;
  /** O preço ainda está a carregar: o pedido não pode partir de um valor errado. */
  carregando?: boolean;
}

/** Pedido de novo valor semanal de um TVDE ao supervisor, no cartão do resumo. */
export const PedidoPrecoSemanal: React.FC<PedidoPrecoSemanalProps> = ({
  contratoId,
  valorAtual,
  carregando = false,
}) => {
  const [aberto, setAberto] = useState(false);
  if (valorAtual === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Pedir alteração do valor semanal:{' '}
        {carregando ? 'a carregar o preço…' : 'sem preço de partida.'}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <BotaoPedirAlteracao
        contratoId={contratoId}
        tipo="preco_semana"
        label="Pedir alteração do valor semanal"
        icon={Euro}
        onClick={() => setAberto(true)}
      />
      <PrecoSemanalPendente contratoId={contratoId} />
      {aberto && (
        <PedirAlteracaoContratoDialog
          open={aberto}
          onOpenChange={setAberto}
          contratoId={contratoId}
          tipo="preco_semana"
          valorAtual={valorAtual}
        />
      )}
    </div>
  );
};
