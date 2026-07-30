import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface TotalPorGestorEntry {
  id: string;
  nome: string;
  count: number;
}

interface RelatorioSelectGestorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalPorGestor: TotalPorGestorEntry[];
  exportGestorLoading: boolean;
  onSelectGestor: (gestorId: string) => Promise<void>;
}

export function RelatorioSelectGestorDialog({
  open,
  onOpenChange,
  totalPorGestor,
  exportGestorLoading,
  onSelectGestor,
}: RelatorioSelectGestorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="space-y-4">
          <div className="space-y-2">
            {/* O cabeçalho e a frase já existiam como markup simples; passam a
                Title/Description para darem nome e descrição acessíveis ao
                diálogo. A aparência é a mesma. */}
            <DialogTitle className="font-semibold text-base">Selecione o Gestor</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Escolha qual gestor deseja incluir no PDF
            </DialogDescription>
          </div>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {totalPorGestor.map((g) => (
              <button
                key={g.id}
                onClick={async () => {
                  onOpenChange(false);
                  await onSelectGestor(g.id);
                }}
                disabled={exportGestorLoading}
                className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{g.nome}</span>
                  <span className="text-sm text-muted-foreground">{g.count} evento(s)</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
