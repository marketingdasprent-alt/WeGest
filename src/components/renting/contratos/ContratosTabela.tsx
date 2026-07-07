import { ChevronDown, ChevronUp, FileText, Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ContratoRenting } from '@/types/contratoRenting';
import { EstadoOperacionalBadge } from './EstadoOperacionalBadge';
import { EstadoFinanceiroBadge } from './EstadoFinanceiroBadge';
import { formatCurrency, formatDateTime } from './contratosUtils';

export type SortColumn =
  | 'codigo'
  | 'matricula'
  | 'grupo'
  | 'data_inicio'
  | 'data_fim'
  | 'cliente_nome'
  | 'estado_operacional'
  | 'estado_financeiro'
  | 'total_final';

export type SortDir = 'asc' | 'desc';

interface ContratosTabelaProps {
  contratos: ContratoRenting[];
  isLoading: boolean;
  totalSemFiltros: number;
  sortColumn: SortColumn;
  sortDir: SortDir;
  onSort: (col: SortColumn) => void;
  onRowClick: (c: ContratoRenting) => void;
  getClienteNome: (id: string | null | undefined) => string;
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

export const ContratosTabela: React.FC<ContratosTabelaProps> = ({
  contratos,
  isLoading,
  totalSemFiltros,
  sortColumn,
  sortDir,
  onSort,
  onRowClick,
  getClienteNome,
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
            <TableHead className="h-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Estação Entrega
            </TableHead>
            <SortableHead column="data_inicio" label="Data Início" {...headProps} />
            <SortableHead column="data_fim" label="Data Fim" {...headProps} />
            <SortableHead column="cliente_nome" label="Cliente" {...headProps} />
            <SortableHead column="estado_operacional" label="Estado" {...headProps} />
            <SortableHead column="estado_financeiro" label="Faturação" {...headProps} />
            <SortableHead
              column="total_final"
              label="Total"
              className="text-right"
              {...headProps}
            />
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
          ) : contratos.length === 0 ? (
            <TableRow className="border-border hover:bg-transparent">
              <TableCell colSpan={10} className="py-16">
                <div className="flex flex-col items-center justify-center gap-2 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {totalSemFiltros === 0
                      ? 'Ainda não há contratos. Cria o primeiro!'
                      : 'Nenhum contrato corresponde à pesquisa.'}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            contratos.map((c) => (
              <TableRow
                key={c.id}
                className="border-border hover:bg-muted/30 cursor-pointer"
                onClick={() => onRowClick(c)}
              >
                <TableCell className="font-medium text-foreground">
                  <div className="flex items-center gap-1.5">
                    {c.codigo}
                    {c.versao > 1 && (
                      <span
                        className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                        title={`${c.versao} versões (histórico de alterações)`}
                      >
                        v{c.versao}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-foreground">{c.matricula ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{c.grupo ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {getEstacaoNome(c.estacao_entrega_id)}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDateTime(c.data_inicio)}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDateTime(c.data_fim)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {getClienteNome(c.cliente_id)}
                </TableCell>
                <TableCell>
                  <EstadoOperacionalBadge estado={c.estado_operacional} />
                </TableCell>
                <TableCell>
                  <EstadoFinanceiroBadge estado={c.estado_financeiro} />
                </TableCell>
                <TableCell className="text-right text-foreground whitespace-nowrap">
                  {formatCurrency(c.total_final ?? c.valor_total_manual)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
