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

/**
 * Confirmação antes de uma acção irreversível, com o AlertDialog do projeto.
 *
 * PORQUE UM HOOK E NÃO MAIS UM DIÁLOGO À MÃO
 * Havia 10 sítios a usar `window.confirm`, que é o diálogo nativo do
 * navegador: ignora o tema, não é traduzível, aparece fora do ecrã em
 * WebView (a app corre em Capacitor) e não é testável. Os outros 53 sítios do
 * projeto já usavam o AlertDialog — os 10 eram os desalinhados.
 *
 * Converter os 10 à mão obrigava a ~15 linhas de estado em cada um. Como o
 * `window.confirm` é síncrono, o código a seguir depende do valor de retorno
 * (`if (!window.confirm(...)) return;`). Este hook devolve uma Promise, o que
 * mantém essa forma: cada sítio troca uma linha por uma linha.
 *
 * Não é uma segunda maneira de confirmar: por baixo é o MESMO AlertDialog que
 * os outros 53 sítios usam. É o caminho para esses deixarem de repetir o
 * estado à mão.
 */

export interface PedidoConfirmacao {
  titulo: string;
  /** O que acontece se confirmar, e o que não se pode desfazer. */
  descricao?: string;
  /** Texto do botão que confirma. Diz a acção: "Remover", não "OK". */
  acao?: string;
  cancelar?: string;
  /** Botão vermelho, para quando a acção destrói dados. */
  destrutiva?: boolean;
}

interface Estado extends PedidoConfirmacao {
  aberto: boolean;
}

const FECHADO: Estado = { aberto: false, titulo: '' };

export function useConfirmacao() {
  const [estado, setEstado] = useState<Estado>(FECHADO);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  /** Abre o diálogo e resolve com `true` se o utilizador confirmar. */
  const confirmar = useCallback((pedido: PedidoConfirmacao) => {
    // Se já houver um pedido pendente, resolve-o como cancelado em vez de o
    // deixar preso para sempre: uma Promise que nunca resolve deixaria o
    // chamador a aguardar indefinidamente.
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
          {/* A descrição é sempre renderizada: o AlertDialog liga-se-lhe por
              aria-describedby, e 69 diálogos do projeto ficaram sem ela. */}
          <AlertDialogDescription>
            {estado.descricao ?? 'Esta acção não pode ser desfeita.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => responder(false)}>
            {estado.cancelar ?? 'Cancelar'}
          </AlertDialogCancel>
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
