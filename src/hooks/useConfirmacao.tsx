import { useCallback, useRef, useState } from 'react';

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
import { cn } from '@/lib/utils';

export interface PedidoConfirmacao {
  titulo: string;

  descricao?: string;

  acao?: string;

  destrutiva?: boolean;
}

interface Estado extends PedidoConfirmacao {
  aberto: boolean;
}

const FECHADO: Estado = { aberto: false, titulo: '' };

export function useConfirmacao() {
  const [estado, setEstado] = useState<Estado>(FECHADO);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirmar = useCallback((pedido: PedidoConfirmacao) => {
    resolverRef.current?.(false);
    setEstado({ ...pedido, aberto: true });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const responder = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setEstado(FECHADO);
  }, []);

  const dialogo = (
    <AlertDialog open={estado.aberto} onOpenChange={(aberto) => !aberto && responder(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{estado.titulo}</AlertDialogTitle>
          {}
          <AlertDialogDescription>
            {estado.descricao ?? 'Esta acção não pode ser desfeita.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => responder(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => responder(true)}
            className={cn(
              estado.destrutiva &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            )}
          >
            {estado.acao ?? 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmar, dialogo };
}
