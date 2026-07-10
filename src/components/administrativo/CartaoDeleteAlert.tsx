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
import type { CartaoFrota } from './cartoesFlotaTab.types';

interface CartaoDeleteAlertProps {
  deleteTarget: CartaoFrota | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function CartaoDeleteAlert({ deleteTarget, onOpenChange, onConfirm }: CartaoDeleteAlertProps) {
  return (
    <AlertDialog open={!!deleteTarget} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar cartão?</AlertDialogTitle>
          <AlertDialogDescription>
            O cartão <strong>{deleteTarget?.numero}</strong> ({deleteTarget?.tipo?.toUpperCase()})
            será eliminado permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={onConfirm}>
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
