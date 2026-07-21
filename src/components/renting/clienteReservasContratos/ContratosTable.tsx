import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import type { ContratoRenting } from '@/types/contratoRenting';
import { CONTRATO_ESTADO_FIN_LABELS, CONTRATO_ESTADO_OP_LABELS } from '@/types/contratoRenting';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';

import { formatDate, getEstadoBadgeColor } from './clienteReservasUtils';

interface ContratosTableProps {
  contratos: ContratoRenting[];
  navigate: (path: string) => void;
}

export const ContratosTable: React.FC<ContratosTableProps> = ({ contratos, navigate }) => {
  const [sortField, setSortField] = useState<string>('data_inicio');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const sortedContratos = useMemo(() => {
    const list = [...contratos];
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
      } else if (sortField === 'estado_operacional') {
        va = a.estado_operacional || '';
        vb = b.estado_operacional || '';
      } else if (sortField === 'estado_financeiro') {
        va = a.estado_financeiro || '';
        vb = b.estado_financeiro || '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [contratos, sortField, sortDir]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground px-1">Contratos</h3>
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
                field="estado_operacional"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9 text-xs"
              >
                Estado Op.
              </SortableTableHead>
              <SortableTableHead
                field="estado_financeiro"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="h-9 text-xs"
              >
                Estado Fin.
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedContratos.map((c) => (
              <TableRow
                key={c.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => navigate(`/renting/contratos/${c.id}`)}
              >
                <TableCell className="text-sm font-medium">#{c.codigo}</TableCell>
                <TableCell className="text-sm">{c.matricula || '—'}</TableCell>
                <TableCell className="text-sm">{formatDate(c.data_inicio)}</TableCell>
                <TableCell className="text-sm">{formatDate(c.data_fim)}</TableCell>
                <TableCell>
                  <Badge className={getEstadoBadgeColor(c.estado_operacional)}>
                    {CONTRATO_ESTADO_OP_LABELS[c.estado_operacional]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={getEstadoBadgeColor(c.estado_financeiro)}>
                    {CONTRATO_ESTADO_FIN_LABELS[c.estado_financeiro]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
