import { useNavigate } from 'react-router-dom';
import { Car, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { MotoristaComVariasViaturas } from '@/hooks/useMotoristasVariasViaturas';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  motoristas: MotoristaComVariasViaturas[];
}

/**
 * Motoristas com dois ou mais veículos atribuídos ao mesmo tempo — sinal de
 * uma atribuição que ficou por fechar. Ver useMotoristasVariasViaturas.
 */
export function MotoristasVariasViaturasDialog({ open, onOpenChange, motoristas }: Props) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5 text-orange-600" /> Motoristas com mais de uma viatura
          </DialogTitle>
          <DialogDescription>
            Um motorista conduz um carro de cada vez. Duas viaturas atribuídas ao mesmo tempo querem
            dizer que uma atribuição ficou por fechar — uma substituição temporária que não foi
            encerrada, ou uma troca feita fora do fluxo de troca. Confirma qual é o carro actual e
            fecha o contrato do outro.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 flex-1 overflow-y-auto px-6">
          <ul className="divide-y divide-border">
            {motoristas.map((m) => (
              <li key={m.motoristaId}>
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/motoristas/${m.motoristaId}`);
                  }}
                  className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{m.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.matriculas.join(' · ')}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                  >
                    {m.matriculas.length} viaturas
                  </Badge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
