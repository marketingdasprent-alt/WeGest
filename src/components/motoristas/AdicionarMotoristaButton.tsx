import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Link2, Plus } from 'lucide-react';
import { MotoristaConviteDialog } from './MotoristaConviteDialog';

interface AdicionarMotoristaButtonProps {
  onAdicionar: () => void;
}

/**
 * Split button: o corpo abre a ficha (caminho de sempre) e a seta dá acesso ao
 * link de convite, que antes só existia na aba Convites da Administração —
 * fechada aos gestores, que são quem mais o usa.
 *
 * O menu não repete "Preencher ficha": carregar no corpo do botão já faz isso,
 * e ter a mesma acção em dois sítios só obriga a escolher entre opções iguais.
 */
export const AdicionarMotoristaButton = ({ onAdicionar }: AdicionarMotoristaButtonProps) => {
  const [conviteOpen, setConviteOpen] = useState(false);

  return (
    <>
      <div className="flex w-full sm:w-auto">
        <Button onClick={onAdicionar} className="flex-1 rounded-r-none sm:flex-none">
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Motorista
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Mais opções para adicionar motorista"
              className="rounded-l-none border-l border-primary-foreground/20 px-2"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => setConviteOpen(true)}>
              <Link2 className="mr-2 h-4 w-4" />
              Convidar por link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MotoristaConviteDialog open={conviteOpen} onOpenChange={setConviteOpen} />
    </>
  );
};
