import { ChevronDown, Mail, MessageSquare, Send, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CanalEnvio } from './envioResumos';

interface EnviarMotoristasMenuProps {
  /** Motoristas que vão receber: os seleccionados, ou a lista filtrada se não houver selecção. */
  quantidade: number;
  temSelecao: boolean;
  disabled?: boolean;
  onEscolher: (canal: CanalEnvio) => void;
}

export function EnviarMotoristasMenu({
  quantidade,
  temSelecao,
  disabled,
  onEscolher,
}: EnviarMotoristasMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-2" disabled={disabled || quantidade === 0}>
          <Send className="h-4 w-4" />
          Enviar aos Motoristas
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {quantidade} motorista{quantidade === 1 ? '' : 's'}
          {temSelecao ? ' seleccionado' + (quantidade === 1 ? '' : 's') : ' da lista'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => onEscolher('whatsapp')}>
          <MessageSquare className="h-4 w-4 text-green-500" />
          WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => onEscolher('email')}>
          <Mail className="h-4 w-4 text-blue-500" />
          E-mail
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => onEscolher('app')}>
          <Smartphone className="h-4 w-4 text-primary" />
          Perfil App
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
