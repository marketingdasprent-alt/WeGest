import { format } from 'date-fns';
import { toast } from 'sonner';
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
import {
  useContactosMotoristas,
  useMarcarResumosEnviados,
  type EstadoEnvio,
} from '@/hooks/useEnvioResumos';
import { NOMES_CANAL, type CanalEnvio } from './envioResumos';
import { EnviarResumoLinha } from './EnviarResumoLinha';
import type { MotoristaResumo } from './contasResumoExports';

interface EnviarResumosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canal: CanalEnvio;
  resumos: MotoristaResumo[];
  weekStart: Date;
  weekEnd: Date;
  enviados: Map<string, EstadoEnvio>;
  formatCurrency: (valor: number) => string;
}

export function EnviarResumosDialog({
  open,
  onOpenChange,
  canal,
  resumos,
  weekStart,
  weekEnd,
  enviados,
  formatCurrency,
}: EnviarResumosDialogProps) {
  const semanaInicio = format(weekStart, 'yyyy-MM-dd');
  const alvo = resumos.filter((r): r is MotoristaResumo & { motorista_id: string } =>
    Boolean(r.motorista_id)
  );
  const ids = alvo.map((r) => r.motorista_id);
  const contactos = useContactosMotoristas(ids, open && canal !== 'app');
  const marcar = useMarcarResumosEnviados();

  const handlePublicarTodos = () =>
    marcar.mutate(
      { motoristaIds: ids, semanaInicio, canal: 'app' },
      {
        onSuccess: (n) => {
          toast.success(
            `${n} resumo${n === 1 ? '' : 's'} publicado${n === 1 ? '' : 's'} no perfil`
          );
          onOpenChange(false);
        },
      }
    );

  const handleEnviarUm = (motoristaId: string) =>
    marcar.mutate({ motoristaIds: [motoristaId], semanaInicio, canal });

  const periodo = `${format(weekStart, 'dd/MM')} a ${format(weekEnd, 'dd/MM/yyyy')}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Enviar aos Motoristas · {NOMES_CANAL[canal]}</DialogTitle>
          <DialogDescription>
            {canal === 'app'
              ? `O resumo de ${periodo} passa a aparecer no perfil de ${alvo.length} motorista${alvo.length === 1 ? '' : 's'}.`
              : `Resumo de ${periodo}. Ao abrir a conversa, o resumo fica também visível no perfil do motorista.`}
          </DialogDescription>
        </DialogHeader>

        {alvo.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum motorista com ficha nesta lista.
          </p>
        ) : canal !== 'app' && contactos.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="-mx-6 flex-1 divide-y overflow-y-auto border-y px-6">
            {alvo.map((r) => (
              <EnviarResumoLinha
                key={r.motorista_id}
                canal={canal}
                resumo={r}
                contacto={contactos.data?.get(r.motorista_id)}
                estado={enviados.get(r.motorista_id)}
                weekStart={weekStart}
                weekEnd={weekEnd}
                formatCurrency={formatCurrency}
                onEnviado={() => handleEnviarUm(r.motorista_id)}
              />
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {canal === 'app' && alvo.length > 0 && (
            <Button onClick={handlePublicarTodos} disabled={marcar.isPending}>
              {marcar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publicar no perfil ({alvo.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
