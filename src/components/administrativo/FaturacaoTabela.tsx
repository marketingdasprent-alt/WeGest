import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import { cn } from '@/lib/utils';
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
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">ID</TableHead>
            <TableHead className="whitespace-nowrap">Contrato</TableHead>
            <TableHead className="whitespace-nowrap">Cliente</TableHead>
            <TableHead className="text-right whitespace-nowrap">Crédito</TableHead>
            <TableHead className="text-right whitespace-nowrap">Débito</TableHead>
            <TableHead className="whitespace-nowrap">Descritivo</TableHead>
            <TableHead className="whitespace-nowrap">Método Pagamento</TableHead>
            <TableHead className="whitespace-nowrap">Estação</TableHead>
            <TableHead className="whitespace-nowrap">Utilizador</TableHead>
            <TableHead className="whitespace-nowrap">Data</TableHead>
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
            rows.map((r) => {
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
