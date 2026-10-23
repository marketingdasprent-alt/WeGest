import { useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAtualizarObservacoesDano } from '@/hooks/useDanoHistorico';

interface DanoObservacoesProps {
  danoId: string;
  observacoes: string | null;
  podeEditar: boolean;
  onGuardado: () => void;
}

export function DanoObservacoes({
  danoId,
  observacoes,
  podeEditar,
  onGuardado,
}: DanoObservacoesProps) {
  const [aEditar, setAEditar] = useState(false);
  const [texto, setTexto] = useState(observacoes ?? '');
  const mutation = useAtualizarObservacoesDano();

  const handleEditar = () => {
    setTexto(observacoes ?? '');
    setAEditar(true);
  };

  const handleGuardar = () => {
    mutation.mutate(
      { danoId, texto },
      {
        onSuccess: () => {
          toast.success('Observações atualizadas!');
          setAEditar(false);
          onGuardado();
        },
        onError: (error: unknown) => {
          const msg = error instanceof Error ? error.message : 'Erro inesperado';
          toast.error('Erro ao atualizar observações', { description: msg });
        },
      }
    );
  };

  if (aEditar) {
    return (
      <div className="space-y-2">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Notas do processo..."
        />
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAEditar(false)}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button size="sm" onClick={handleGuardar} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </div>
      </div>
    );
  }

  if (!observacoes && !podeEditar) return null;

  return (
    <div className="flex items-start gap-2">
      {observacoes ? (
        <p className="flex-1 whitespace-pre-wrap text-sm text-muted-foreground bg-muted/50 rounded p-2">
          {observacoes}
        </p>
      ) : (
        <p className="flex-1 text-sm text-muted-foreground italic">Sem observações</p>
      )}
      {podeEditar && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={handleEditar}
          aria-label="Editar observações"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
