import type { FaturacaoRow } from '../../faturacao';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface FaturacaoAlertasSectionProps {
  anularRow: FaturacaoRow | null;
  anularMotivo: string;
  anularBusy: boolean;
  onAnularMotivoChange: (value: string) => void;
  onConfirmarAnular: () => void;
  onOpenChange: (open: boolean) => void;
}

/** AlertDialog de confirmação de anulação (recibo ou nota de crédito). */
export function FaturacaoAlertasSection({
  anularRow,
  anularMotivo,
  anularBusy,
  onAnularMotivoChange,
  onConfirmarAnular,
  onOpenChange,
}: FaturacaoAlertasSectionProps) {
  return (
    <AlertDialog
      open={!!anularRow}
      onOpenChange={(o) => {
        if (!o && !anularBusy) {
          onOpenChange(false);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {anularRow?.docTipo === 'recibo' ? 'Anular recibo?' : 'Anular nota de crédito?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {anularRow?.docTipo === 'recibo'
              ? 'Anula o recibo e lança um anulamento na conta-corrente. Um recibo anula-se internamente — não é emitido documento fiscal.'
              : 'Anula a nota de crédito e lança um anulamento na conta-corrente. A reversão fiscal de uma NC seria uma Nota de Débito, que não é emitida aqui.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="anular-motivo">
            Motivo da anulação <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="anular-motivo"
            value={anularMotivo}
            onChange={(e) => onAnularMotivoChange(e.target.value)}
            placeholder="Ex.: pagamento devolvido pelo banco"
            className="min-h-[72px] resize-none"
            disabled={anularBusy}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {anularRow?.docTipo === 'recibo'
              ? 'Este texto é enviado ao motorista por email — escreve algo que ele perceba.'
              : 'Fica registado no histórico da nota de crédito.'}
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={anularBusy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirmarAnular();
            }}
            disabled={anularBusy || !anularMotivo.trim()}
            title={!anularMotivo.trim() ? 'Indica o motivo para continuar' : undefined}
            className="bg-rose-600 hover:bg-rose-700"
          >
            {anularBusy ? 'A anular…' : 'Anular'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
