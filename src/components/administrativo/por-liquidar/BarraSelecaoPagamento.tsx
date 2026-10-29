import { Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/formatters';

interface BarraSelecaoPagamentoProps {
  quantas: number;
  total: number;
  onLimpar: () => void;
  onRegistarPagamento: () => void;
}

/** Só existe com faturas escolhidas: um botão apagado e sempre à vista confundia mais do que ajudava. */
export const BarraSelecaoPagamento: React.FC<BarraSelecaoPagamentoProps> = ({
  quantas,
  total,
  onLimpar,
  onRegistarPagamento,
}) => {
  if (quantas === 0) return null;
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-lg bg-primary px-4 py-3 text-primary-foreground shadow-lg">
      <p className="flex-1 text-sm">
        <span className="font-semibold">
          {quantas} {quantas === 1 ? 'fatura escolhida' : 'faturas escolhidas'}
        </span>{' '}
        · <span className="tabular-nums">{formatCurrency(total)}</span>
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
        onClick={onLimpar}
      >
        Limpar
      </Button>
      <Button size="sm" variant="secondary" className="gap-2" onClick={onRegistarPagamento}>
        <Banknote className="h-4 w-4" /> Registar pagamento
      </Button>
    </div>
  );
};
