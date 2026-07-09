import { Loader2, Printer, ChevronDown, FileText, Files, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ContasResumoBulkBarProps {
  selectedCount: number;
  isBulkSending: boolean;
  onPrintConsolidado: () => void;
  onPrintIndividuais: () => void;
  onBulkEmail: () => void;
  onClearSelection: () => void;
}

export function ContasResumoBulkBar({
  selectedCount,
  isBulkSending,
  onPrintConsolidado,
  onPrintIndividuais,
  onBulkEmail,
  onClearSelection,
}: ContasResumoBulkBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="text-sm font-medium">
        {selectedCount} selecionado{selectedCount !== 1 && 's'}
      </div>
      <div className="h-4 w-[1px] bg-border" />
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2">
              <Printer className="h-4 w-4" />
              Imprimir
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-72">
            <DropdownMenuItem className="cursor-pointer gap-3 py-2.5" onClick={onPrintConsolidado}>
              <FileText className="h-4 w-4 text-primary" />
              <div className="flex flex-col">
                <span className="font-medium">Relatório consolidado</span>
                <span className="text-xs text-muted-foreground">
                  Tabela com todos os motoristas selecionados
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-3 py-2.5" onClick={onPrintIndividuais}>
              <Files className="h-4 w-4 text-primary" />
              <div className="flex flex-col">
                <span className="font-medium">Relatórios individuais</span>
                <span className="text-xs text-muted-foreground">
                  1 página por motorista (PDF combinado)
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          className="h-9 gap-2 rounded-full"
          disabled={isBulkSending}
          onClick={onBulkEmail}
        >
          {isBulkSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Enviar por Email
        </Button>
      </div>
      <div className="h-4 w-[1px] bg-border" />
      <Button
        size="sm"
        variant="ghost"
        className="h-9 px-3 rounded-full hover:bg-destructive/10 hover:text-destructive"
        onClick={onClearSelection}
      >
        Limpar
      </Button>
    </div>
  );
}
