import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { DOC_TIPO_LABEL, DOC_TIPO_CLASS, type FaturacaoRow } from './faturacao';

interface FaturacaoTabelaProps {
  rows: FaturacaoRow[];
  loading?: boolean;
  pageSize?: number;
  onRowClick?: (row: FaturacaoRow) => void;
}

const COLS = 10;

export function FaturacaoTabela({
  rows,
  loading,
  pageSize = 50,
  onRowClick,
}: FaturacaoTabelaProps) {
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'id') {
        va = a.numeroDoc !== '—' ? a.numeroDoc : a.id;
        vb = b.numeroDoc !== '—' ? b.numeroDoc : b.id;
      } else if (sortField === 'contratoLabel') {
        va = a.contratoLabel || '';
        vb = b.contratoLabel || '';
      } else if (sortField === 'clienteNome') {
        va = a.clienteNome || '';
        vb = b.clienteNome || '';
      } else if (sortField === 'credito') {
        va = a.credito ?? 0;
        vb = b.credito ?? 0;
      } else if (sortField === 'debito') {
        va = a.debito ?? 0;
        vb = b.debito ?? 0;
      } else if (sortField === 'descritivo') {
        va = a.descritivo || '';
        vb = b.descritivo || '';
      } else if (sortField === 'metodoLabel') {
        va = a.metodoLabel || '';
        vb = b.metodoLabel || '';
      } else if (sortField === 'estacaoNome') {
        va = a.estacaoNome || '';
        vb = b.estacaoNome || '';
      } else if (sortField === 'utilizador') {
        va = a.utilizador || '';
        vb = b.utilizador || '';
      } else if (sortField === 'createdAt') {
        va = a.createdAt || '';
        vb = b.createdAt || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [rows, sortField, sortDir]);

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead
              field="id"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="whitespace-nowrap"
            >
              ID
            </SortableTableHead>
            <SortableTableHead
              field="contratoLabel"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="whitespace-nowrap"
            >
              Contrato
            </SortableTableHead>
            <SortableTableHead
              field="clienteNome"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="whitespace-nowrap"
            >
              Cliente
            </SortableTableHead>
            <SortableTableHead
              field="credito"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              align="right"
              className="whitespace-nowrap"
            >
              Crédito
            </SortableTableHead>
            <SortableTableHead
              field="debito"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              align="right"
              className="whitespace-nowrap"
            >
              Débito
            </SortableTableHead>
            <SortableTableHead
              field="descritivo"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="whitespace-nowrap"
            >
              Descritivo
            </SortableTableHead>
            <SortableTableHead
              field="metodoLabel"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="whitespace-nowrap"
            >
              Método Pagamento
            </SortableTableHead>
            <SortableTableHead
              field="estacaoNome"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="whitespace-nowrap"
            >
              Estação
            </SortableTableHead>
            <SortableTableHead
              field="utilizador"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="whitespace-nowrap"
            >
              Utilizador
            </SortableTableHead>
            <SortableTableHead
              field="createdAt"
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              className="whitespace-nowrap"
            >
              Data
            </SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
              <TableRow key={`sk-${i}`}>
                {Array.from({ length: COLS }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full min-w-[40px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLS} className="h-32 text-center text-muted-foreground">
                Sem faturação registada para os filtros selecionados.
              </TableCell>
            </TableRow>
          ) : (
            sortedRows.map((r) => {
              const idLabel = r.numeroDoc !== '—' ? r.numeroDoc : r.id.slice(0, 8).toUpperCase();
              return (
                <TableRow
                  key={r.id}
                  onClick={() => onRowClick?.(r)}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  <TableCell className="font-mono text-xs whitespace-nowrap">{idLabel}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.contratoLabel}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={r.clienteNome}>
                    {r.clienteNome}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
                    {r.credito != null ? formatCurrency(r.credito) : '—'}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium">
                    {r.debito != null ? formatCurrency(r.debito) : '—'}
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge
                        variant="secondary"
                        className={cn('shrink-0 border-0', DOC_TIPO_CLASS[r.docTipo] ?? '')}
                      >
                        {DOC_TIPO_LABEL[r.docTipo] ?? r.docTipo}
                      </Badge>
                      <span className="truncate text-sm text-muted-foreground" title={r.descritivo}>
                        {r.descritivo}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.metodoLabel}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.estacaoNome}</TableCell>
                  <TableCell
                    className="max-w-[140px] truncate whitespace-nowrap"
                    title={r.utilizador}
                  >
                    {r.utilizador}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(r.createdAt)}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
