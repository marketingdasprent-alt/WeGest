import { Upload, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmtDate, TIPO_INFO } from './cartoesFlotaTab.types';
import type { ImportRow } from './cartoesFlotaImport';

interface CartoesImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importRows: ImportRow[];
  importing: boolean;
  onConfirm: () => void;
}

export function CartoesImportDialog({
  open,
  onOpenChange,
  importRows,
  importing,
  onConfirm,
}: CartoesImportDialogProps) {
  const valid = importRows.filter((r) => r.erros.length === 0);
  const invalid = importRows.filter((r) => r.erros.length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-muted-foreground" />
            Importar Cartões Frota
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4 text-sm px-1">
          <span className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            {valid.length} válido(s)
          </span>
          {invalid.length > 0 && (
            <span className="flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {invalid.length} com erro — serão ignorado(s)
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Âmbito</TableHead>
                <TableHead className="text-right">Limite</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {importRows.map((r) => {
                const ok = r.erros.length === 0;
                const info = r.tipo ? TIPO_INFO[r.tipo] : null;
                return (
                  <TableRow key={r._row} className={!ok ? 'bg-destructive/5' : ''}>
                    <TableCell className="text-xs text-muted-foreground">{r._row}</TableCell>
                    <TableCell>
                      {info ? (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${info.badgeCls}`}
                        >
                          {info.label}
                        </span>
                      ) : (
                        <span className="text-xs text-destructive">{String(r.tipo || '-')}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {r.numero || <span className="text-destructive text-xs">em falta</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.ambito || '-'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {r.limite ? `${Number(r.limite).toFixed(2)} €` : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.data_validade ? fmtDate(r.data_validade) : '-'}
                    </TableCell>
                    <TableCell>
                      {ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <span className="text-xs text-destructive">{r.erros.join(', ')}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={importing || valid.length === 0}>
            {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Importar {valid.length} cartão(ões)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
