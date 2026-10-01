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

interface ConfirmarRemocaoPrecosDialogProps {
  /** Mensagem da recusa da BD (já lista os contratos); `null` = fechado. */
  mensagem: string | null;
  onCancelar: () => void;
  onConfirmar: () => void;
}

export const ConfirmarRemocaoPrecosDialog: React.FC<ConfirmarRemocaoPrecosDialogProps> = ({
  mensagem,
  onCancelar,
  onConfirmar,
}) => (
  <AlertDialog open={mensagem !== null} onOpenChange={(aberto) => !aberto && onCancelar()}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Tirar preços em uso?</AlertDialogTitle>
        <AlertDialogDescription>{mensagem}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        {/* Sem o preventDefault a Radix fecha por onOpenChange e dispara também
            onCancelar; quem fecha é o pai, ao limpar a mensagem. */}
        <AlertDialogAction
          onClick={(e) => {
            e.preventDefault();
            onConfirmar();
          }}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          Gravar mesmo assim
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
