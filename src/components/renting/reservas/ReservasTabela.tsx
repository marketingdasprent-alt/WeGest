import { CalendarCheck, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
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

interface SortableHeadProps {
  column: SortColumn;
  label: string;
  className?: string;
  current: SortColumn;
  dir: SortDir;
  onSort: (col: SortColumn) => void;
}

const SortableHead: React.FC<SortableHeadProps> = ({
  column,
  label,
  className,
  current,
  dir,
  onSort,
}) => (
  <TableHead
    className={cn(
      'h-10 cursor-pointer select-none whitespace-nowrap hover:bg-muted/40 transition-colors text-xs font-semibold uppercase tracking-wide text-muted-foreground',
      className
    )}
    onClick={() => onSort(column)}
  >
    <div className="flex items-center gap-1">
      {label}
      {current === column ? (
        dir === 'asc' ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ChevronDown className="h-3.5 w-3.5 opacity-30" />
      )}
    </div>
  </TableHead>
);

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
  const headProps = { current: sortColumn, dir: sortDir, onSort };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <SortableHead column="codigo" label="Código" {...headProps} />
            <SortableHead column="matricula" label="Matrícula" {...headProps} />
            <SortableHead column="grupo" label="Grupo" {...headProps} />
            <TableHead className="h-10 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Regime
            </TableHead>
            <SortableHead column="estacao_entrega_id" label="Estação Entrega" {...headProps} />
            <SortableHead column="data_inicio" label="Data Início" {...headProps} />
            <SortableHead column="data_fim" label="Data Fim" {...headProps} />
            <SortableHead column="cliente_nome" label="Cliente" {...headProps} />
            <SortableHead column="condutor_nome" label="Condutor" {...headProps} />
            <SortableHead column="estado" label="Estado" className="text-right" {...headProps} />
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
