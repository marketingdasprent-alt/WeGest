import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy, Share2 } from 'lucide-react';
import { useMotoristaInviteLink } from '@/hooks/useMotoristaInviteLink';

interface MotoristaConviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mostra o link de registo da org ativa para o gestor o enviar ao motorista.
 * Em telemóvel oferece "Partilhar" (navigator.share), que é por onde o link
 * segue na prática — WhatsApp.
 */
export const MotoristaConviteDialog = ({ open, onOpenChange }: MotoristaConviteDialogProps) => {
  const { link, copiar } = useMotoristaInviteLink();
  const podePartilhar = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const partilhar = async () => {
    if (!link) return;
    try {
      await navigator.share({
        title: 'Registo de motorista',
        text: 'Regista-te aqui para entrares na nossa frota:',
        url: link,
      });
    } catch {
      // O utilizador cancelou a partilha — não é erro.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar motorista</DialogTitle>
          <DialogDescription>
            Envia este link ao motorista. Ele preenche a ficha e fica associado à tua empresa.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="break-all font-mono text-sm text-primary">{link}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={copiar} className="flex-1">
                <Copy className="mr-2 h-4 w-4" />
                Copiar link
              </Button>
              {podePartilhar && (
                <Button variant="outline" onClick={partilhar} className="flex-1">
                  <Share2 className="mr-2 h-4 w-4" />
                  Partilhar
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            A organização ativa está sem código. Defina o código da empresa nas configurações.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};
