import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useDesbloquearFaturacaoIntegracao } from '@/hooks/useDesbloquearFaturacaoIntegracao';

interface Props {
  integracaoId: string;
  motivo: string | null;
  onDesbloqueada: () => void;
}

/** Aviso (com confirmação) de uma integração travada por um total divergente. */
export const FaturacaoBloqueadaAviso: React.FC<Props> = ({
  integracaoId,
  motivo,
  onDesbloqueada,
}) => {
  const desbloquear = useDesbloquearFaturacaoIntegracao();

  return (
    <div
      role="alert"
      className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
    >
      <AlertTriangle
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-destructive"
      />
      <div className="space-y-2">
        <p className="font-medium text-destructive">
          A emissão de faturas desta integração está bloqueada. Notas de crédito continuam a poder
          ser emitidas.
        </p>
        <p className="text-muted-foreground">{motivo || 'Motivo não registado.'}</p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={desbloquear.isPending}>
              {desbloquear.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Desbloquear faturação
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desbloquear a faturação?</AlertDialogTitle>
              <AlertDialogDescription>
                Confirme primeiro, na KeyInvoice, o documento que causou o bloqueio. Depois de
                desbloquear, esta integração volta a emitir faturas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => desbloquear.mutate(integracaoId, { onSuccess: onDesbloqueada })}
              >
                Desbloquear
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};
