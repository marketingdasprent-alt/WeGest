import { X, Printer, Loader2, MessageSquare, Mail, UserCheck, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ResumoActionBarProps {
  onClose: () => void;
  isSending: boolean;
  onSendWhatsApp: () => void;
  onOpenEmail: () => void;
  onSendAccount: () => void;
  onPrint: () => void;
}

/**
 * O envio por WhatsApp é o caminho de todos os dias e tem botão próprio: ao
 * lado de duas opções raras, custava dois cliques e um menu. O email e o envio
 * à conta continuam a existir, um nível abaixo.
 */
export function ResumoActionBar({
  onClose,
  isSending,
  onSendWhatsApp,
  onOpenEmail,
  onSendAccount,
  onPrint,
}: ResumoActionBarProps) {
  return (
    <div className="flex justify-end gap-3 pt-4 border-t print:hidden">
      <Button variant="outline" onClick={onClose}>
        <X className="h-4 w-4 mr-2" />
        Fechar
      </Button>

      <Button variant="outline" onClick={onSendWhatsApp} disabled={isSending}>
        {isSending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <MessageSquare className="h-4 w-4 mr-2 text-green-500" />
        )}
        Enviar
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Mais opções" disabled={isSending}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpenEmail}>
            <Mail className="h-4 w-4 mr-2 text-blue-500" />
            Email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSendAccount}>
            <UserCheck className="h-4 w-4 mr-2 text-primary" />
            Enviar à Conta
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button onClick={onPrint}>
        <Printer className="h-4 w-4 mr-2" />
        Imprimir
      </Button>
    </div>
  );
}
