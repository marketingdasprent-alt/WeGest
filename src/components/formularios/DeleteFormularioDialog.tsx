import React from 'react';
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

interface DeleteFormularioDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  formularioNome: string;
}

export const DeleteFormularioDialog: React.FC<DeleteFormularioDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  formularioNome,
}) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Formulário</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o formulário "{formularioNome}"? Esta ação não pode ser
            desfeita e todos os dados associados serão perdidos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
