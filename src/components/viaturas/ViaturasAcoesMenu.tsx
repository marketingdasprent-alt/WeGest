import { useState } from 'react';
import { FileSpreadsheet, Loader2, MoreHorizontal, Printer, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImportViaturasDialog } from '@/components/viaturas/ImportViaturasDialog';

interface ViaturasAcoesMenuProps {
  onImprimir: () => void;
  onExportarExcel: () => void;
  aImprimir: boolean;
  /** Sem viaturas à vista não há nada para imprimir/exportar. */
  semResultados: boolean;
  onImportado: () => void;
}

/** Acções secundárias da Frota num só menu, para "Nova Viatura" ficar sozinha em destaque. */
export function ViaturasAcoesMenu({
  onImprimir,
  onExportarExcel,
  aImprimir,
  semResultados,
  onImportado,
}: ViaturasAcoesMenuProps) {
  const [importarAberto, setImportarAberto] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full sm:w-auto" aria-label="Mais acções da frota">
            {aImprimir ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="ml-2 sm:hidden">Mais acções</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onImprimir} disabled={aImprimir || semResultados}>
            <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
            Imprimir lista
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onExportarExcel} disabled={semResultados}>
            <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
            Exportar Excel
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setImportarAberto(true)}>
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            Importar Excel
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ImportViaturasDialog
        open={importarAberto}
        onOpenChange={setImportarAberto}
        onImportComplete={onImportado}
      />
    </>
  );
}
