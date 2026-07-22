import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import type { Reserva } from '@/types/reserva';
import { ESTADO_LABELS } from '@/types/reserva';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';

import { formatDate, getEstadoBadgeColor } from './clienteReservasUtils';

interface ReservasTableProps {
  reservas: Reserva[];
  navigate: (path: string) => void;
}

export const ReservasTable: React.FC<ReservasTableProps> = ({ reservas, navigate }) => {
  const [sortField, setSortField] = useState<string>('data_inicio');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const sortedReservas = useMemo(() => {
    const list = [...reservas];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'codigo') {
        va = a.codigo;
        vb = b.codigo;
      } else if (sortField === 'matricula') {
        va = a.matricula || '';
        vb = b.matricula || '';
      } else if (sortField === 'data_inicio') {
        va = a.data_inicio || '';
        vb = b.data_inicio || '';
      } else if (sortField === 'data_fim') {
        va = a.data_fim || '';
        vb = b.data_fim || '';
      } else if (sortField === 'valor_total') {
        va = a.valor_total || 0;
        vb = b.valor_total || 0;
      } else if (sortField === 'estado') {
        va = a.estado || '';
        vb = b.estado || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [reservas, sortField, sortDir]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground px-1">Reservas</h3>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableTableHead
                field="codigo"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9 text-xs"
              >
                Código
              </SortableTableHead>
              <SortableTableHead
                field="matricula"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9 text-xs"
              >
                Matrícula
              </SortableTableHead>
              <SortableTableHead
                field="data_inicio"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9 text-xs"
              >
                Data Início
              </SortableTableHead>
              <SortableTableHead
                field="data_fim"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9 text-xs"
              >
                Data Fim
              </SortableTableHead>
              <SortableTableHead
                field="valor_total"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9 text-xs"
                align="right"
              >
                Valor
              </SortableTableHead>
              <SortableTableHead
                field="estado"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9 text-xs"
              >
                Estado
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedReservas.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => navigate(`/renting/reservas/${r.id}`)}
              >
                <TableCell className="text-sm font-medium">#{r.codigo}</TableCell>
                <TableCell className="text-sm">{r.matricula || '—'}</TableCell>
                <TableCell className="text-sm">{formatDate(r.data_inicio)}</TableCell>
                <TableCell className="text-sm">{formatDate(r.data_fim)}</TableCell>
                <TableCell className="text-sm">
                  {r.valor_total ? `€${r.valor_total.toFixed(2)}` : '—'}
                </TableCell>
                <TableCell>
                  <Badge className={getEstadoBadgeColor(r.estado)}>{ESTADO_LABELS[r.estado]}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
