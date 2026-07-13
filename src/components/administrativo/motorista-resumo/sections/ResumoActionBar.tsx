import { X, Printer, Send, Loader2, MessageSquare, Mail, UserCheck } from 'lucide-react';
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={isSending}>
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onSendWhatsApp}>
            <MessageSquare className="h-4 w-4 mr-2 text-green-500" />
            WhatsApp
          </DropdownMenuItem>
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
