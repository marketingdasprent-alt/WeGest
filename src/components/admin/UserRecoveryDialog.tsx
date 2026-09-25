import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface UserRecoveryDialogProps {
  readonly open: boolean;
  readonly email: string;
  readonly isPending: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSend: () => void;
}

export const UserRecoveryDialog = ({
  open,
  email,
  isPending,
  onOpenChange,
  onSend,
}: UserRecoveryDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-card border-border">
      <DialogHeader>
        <DialogTitle>Enviar recuperação de acesso</DialogTitle>
        <DialogDescription>
          O titular recebe um email e escolhe a sua palavra-passe. A conta é partilhada entre
          organizações.
        </DialogDescription>
      </DialogHeader>
      <div className="p-3 bg-muted rounded-md border border-border">
        <p className="text-sm text-muted-foreground">Utilizador</p>
        <p className="font-medium break-all">{email}</p>
        <p className="text-xs text-muted-foreground mt-2">O envio usa o email atual da conta.</p>
      </div>
      <DialogFooter>
        <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button disabled={isPending} onClick={onSend}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending ? 'A enviar...' : 'Enviar recuperação'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
