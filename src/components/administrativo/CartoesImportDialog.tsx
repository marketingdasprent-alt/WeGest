import { useMemo, useState } from 'react';
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
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
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

  const [sortField, setSortField] = useState<string>('_row');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const sortedRows = useMemo(() => {
    const list = [...importRows];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'tipo') {
        va = a.tipo || '';
        vb = b.tipo || '';
      } else if (sortField === 'numero') {
        va = a.numero || '';
        vb = b.numero || '';
      } else if (sortField === 'ambito') {
        va = a.ambito || '';
        vb = b.ambito || '';
      } else if (sortField === 'limite') {
        va = a.limite ? Number(a.limite) : 0;
        vb = b.limite ? Number(b.limite) : 0;
      } else if (sortField === 'data_validade') {
        va = a.data_validade || '';
        vb = b.data_validade || '';
      } else if (sortField === 'estado') {
        va = a.erros.length === 0 ? 0 : 1;
        vb = b.erros.length === 0 ? 0 : 1;
      } else if (sortField === '_row') {
        va = a._row;
        vb = b._row;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [importRows, sortField, sortDir]);

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
                <SortableTableHead
                  field="tipo"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Tipo
                </SortableTableHead>
                <SortableTableHead
                  field="numero"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Número
                </SortableTableHead>
                <SortableTableHead
                  field="ambito"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Âmbito
                </SortableTableHead>
                <SortableTableHead
                  field="limite"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="right"
                >
                  Limite
                </SortableTableHead>
                <SortableTableHead
                  field="data_validade"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Validade
                </SortableTableHead>
                <SortableTableHead
                  field="estado"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Estado
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((r) => {
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
