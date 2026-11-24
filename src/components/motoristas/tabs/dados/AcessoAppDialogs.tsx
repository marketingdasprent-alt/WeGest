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

interface AcessoAppDialogsProps {
  emailDestino: string | null;
  confirmarEnvioAberto: boolean;
  substituicaoAberta: boolean;
  onConfirmarEnvio: () => void;
  onConfirmarSubstituicao: () => void;
  onFecharEnvio: () => void;
  onFecharSubstituicao: () => void;
}

export function AcessoAppDialogs({
  emailDestino,
  confirmarEnvioAberto,
  substituicaoAberta,
  onConfirmarEnvio,
  onConfirmarSubstituicao,
  onFecharEnvio,
  onFecharSubstituicao,
}: AcessoAppDialogsProps) {
  return (
    <>
      <AlertDialog open={confirmarEnvioAberto} onOpenChange={(o) => !o && onFecharEnvio()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar acesso à app</AlertDialogTitle>
            <AlertDialogDescription>
              Vai ser enviada uma senha provisória, válida durante 72 horas, para{' '}
              <strong>{emailDestino ?? 'o email da ficha'}</strong>. O motorista escolhe a senha
              definitiva no primeiro acesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={onConfirmarEnvio}>
              Enviar acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={substituicaoAberta} onOpenChange={(o) => !o && onFecharSubstituicao()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir a senha atual</AlertDialogTitle>
            <AlertDialogDescription>
              Este motorista já entra na app. Enviar uma senha provisória substitui a senha atual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={onConfirmarSubstituicao}>
              Substituir e enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
