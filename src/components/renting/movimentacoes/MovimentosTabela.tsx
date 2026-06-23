import { ArrowRightLeft, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Movimento } from '@/types/movimento';
import { MovimentoEstadoBadge, MovimentoTipoBadge } from './MovimentoBadges';
import { formatDateTime } from './movimentosUtils';

export type SortColumn =
  | 'codigo'
  | 'tipo'
  | 'matricula'
  | 'data_partida'
  | 'data_chegada'
  | 'colaborador_nome'
  | 'estado';

export type SortDir = 'asc' | 'desc';

interface MovimentosTabelaProps {
  movimentos: Movimento[];
  isLoading: boolean;
  totalSemFiltros: number;
  sortColumn: SortColumn;
  sortDir: SortDir;
  onSort: (col: SortColumn) => void;
  onRowClick: (m: Movimento) => void;
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

export const MovimentosTabela: React.FC<MovimentosTabelaProps> = ({
  movimentos,
  isLoading,
  totalSemFiltros,
  sortColumn,
  sortDir,
  onSort,
  onRowClick,
}) => {
  const headProps = { current: sortColumn, dir: sortDir, onSort };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <SortableHead column="codigo" label="Código" {...headProps} />
            <SortableHead column="tipo" label="Tipo" {...headProps} />
            <SortableHead column="matricula" label="Matrícula" {...headProps} />
            <SortableHead column="data_partida" label="Data Partida" {...headProps} />
            <SortableHead column="data_chegada" label="Data Chegada" {...headProps} />
            <TableHead className="h-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Info
            </TableHead>
            <SortableHead column="colaborador_nome" label="Colaborador" {...headProps} />
            <SortableHead column="estado" label="Estado" className="text-right" {...headProps} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow className="border-border hover:bg-transparent">
              <TableCell colSpan={8} className="py-16">
                <div className="flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              </TableCell>
            </TableRow>
          ) : movimentos.length === 0 ? (
            <TableRow className="border-border hover:bg-transparent">
              <TableCell colSpan={8} className="py-16">
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  <ArrowRightLeft className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {totalSemFiltros === 0
                      ? 'Ainda não há movimentos. Cria o primeiro!'
                      : 'Nenhum movimento corresponde à pesquisa.'}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            movimentos.map((m) => (
              <TableRow
                key={m.id}
                className="border-border hover:bg-muted/30 cursor-pointer"
                onClick={() => onRowClick(m)}
              >
                <TableCell className="font-medium text-foreground">{m.codigo}</TableCell>
                <TableCell>
                  <MovimentoTipoBadge tipo={m.tipo} />
                </TableCell>
                <TableCell className="text-foreground whitespace-nowrap">
                  {m.matricula ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDateTime(m.data_partida)}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDateTime(m.data_chegada)}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[220px] truncate">
                  {m.info || m.motivo || '—'}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {m.colaborador_nome ?? '—'}
                </TableCell>
                <TableCell className="text-right">
                  <MovimentoEstadoBadge estado={m.estado} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
