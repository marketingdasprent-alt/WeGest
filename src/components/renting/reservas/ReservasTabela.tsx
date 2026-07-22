import { CalendarCheck, Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import type { Reserva } from '@/types/reserva';
import { EstadoBadge } from './EstadoBadge';
import { RegimeBadge } from './RegimeBadge';
import { formatDateTime } from './reservasUtils';

export type SortColumn =
  | 'codigo'
  | 'matricula'
  | 'grupo'
  | 'estacao_entrega_id'
  | 'data_inicio'
  | 'data_fim'
  | 'cliente_nome'
  | 'condutor_nome'
  | 'estado';

export type SortDir = 'asc' | 'desc';

interface ReservasTabelaProps {
  reservas: Reserva[];
  isLoading: boolean;
  totalSemFiltros: number;
  sortColumn: SortColumn;
  sortDir: SortDir;
  onSort: (col: SortColumn) => void;
  onRowClick: (r: Reserva) => void;
  getEstacaoNome: (id: string | null | undefined) => string;
}

export const ReservasTabela: React.FC<ReservasTabelaProps> = ({
  reservas,
  isLoading,
  totalSemFiltros,
  sortColumn,
  sortDir,
  onSort,
  onRowClick,
  getEstacaoNome,
}) => {
  const handleSort = (f: string) => onSort(f as SortColumn);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <SortableTableHead
              field="codigo"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Código
            </SortableTableHead>
            <SortableTableHead
              field="matricula"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Matrícula
            </SortableTableHead>
            <SortableTableHead
              field="grupo"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Grupo
            </SortableTableHead>
            <TableHead className="h-10 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Regime
            </TableHead>
            <SortableTableHead
              field="estacao_entrega_id"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Estação Entrega
            </SortableTableHead>
            <SortableTableHead
              field="data_inicio"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Data Início
            </SortableTableHead>
            <SortableTableHead
              field="data_fim"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Data Fim
            </SortableTableHead>
            <SortableTableHead
              field="cliente_nome"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Cliente
            </SortableTableHead>
            <SortableTableHead
              field="condutor_nome"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
            >
              Condutor
            </SortableTableHead>
            <SortableTableHead
              field="estado"
              sortField={sortColumn}
              sortDir={sortDir}
              onSort={handleSort}
              align="right"
            >
              Estado
            </SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow className="border-border hover:bg-transparent">
              <TableCell colSpan={10} className="py-16">
                <div className="flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              </TableCell>
            </TableRow>
          ) : reservas.length === 0 ? (
            <TableRow className="border-border hover:bg-transparent">
              <TableCell colSpan={10} className="py-16">
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  <CalendarCheck className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {totalSemFiltros === 0
                      ? 'Ainda não há reservas. Cria a primeira!'
                      : 'Nenhuma reserva corresponde à pesquisa.'}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            reservas.map((r) => (
              <TableRow
                key={r.id}
                className="border-border hover:bg-muted/30 cursor-pointer"
                onClick={() => onRowClick(r)}
              >
                <TableCell className="font-medium text-foreground">{r.codigo}</TableCell>
                <TableCell className="text-foreground">{r.matricula ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{r.grupo ?? '—'}</TableCell>
                <TableCell>
                  <RegimeBadge regime={r.regime} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {getEstacaoNome(r.estacao_entrega_id)}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDateTime(r.data_inicio)}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDateTime(r.data_fim)}
                </TableCell>
                <TableCell className="text-muted-foreground">{r.cliente_nome ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{r.condutor_nome ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <EstadoBadge estado={r.estado} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
