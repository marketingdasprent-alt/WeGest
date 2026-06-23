import { Loader2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MOVIMENTO_TIPO_LABELS, type Movimento } from '@/types/movimento';

interface MovimentoDeleteConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movimento: Movimento | null;
  isPending: boolean;
  onConfirm: () => void;
}

export const MovimentoDeleteConfirm: React.FC<MovimentoDeleteConfirmProps> = ({
  open,
  onOpenChange,
  movimento,
  isPending,
  onConfirm,
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Eliminar movimento?</AlertDialogTitle>
        <AlertDialogDescription>
          O movimento <strong>#{movimento?.codigo}</strong>
          {movimento ? (
            <>
              {' '}
              ({MOVIMENTO_TIPO_LABELS[movimento.tipo]}
              {movimento.matricula ? ` · ${movimento.matricula}` : ''})
            </>
          ) : null}{' '}
          será eliminado permanentemente. Esta acção não pode ser desfeita.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disabled={isPending}
          onClick={(e) => {
            e.preventDefault();
            onConfirm();
          }}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          Eliminar
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
