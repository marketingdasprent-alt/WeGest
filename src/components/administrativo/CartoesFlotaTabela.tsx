import { Loader2, History, Pencil, Trash2, UserCheck, UserX, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { TablePagination } from '@/components/ui/TablePagination';
import { TIPO_INFO, STATUS_INFO, fmtEur, fmtDate, type CartaoFrota } from './cartoesFlotaTab.types';

interface CartoesFlotaTabelaProps {
  loading: boolean;
  cartoesLength: number;
  filtered: CartaoFrota[];
  pageItems: CartaoFrota[];
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
  consumoOf: (c: CartaoFrota) => number;
  titularLabel: (c: CartaoFrota) => { texto: string; tipo: 'motorista' | 'cliente' } | null;
  onEdit: (c: CartaoFrota) => void;
  onEntrega: (c: CartaoFrota) => void;
  onDevolucao: (c: CartaoFrota) => void;
  onHistory: (c: CartaoFrota) => void;
  onDeleteRequest: (c: CartaoFrota) => void;
  pagination: {
    page: number;
    totalPages: number;
    total: number;
    start: number;
    end: number;
    pageSizeStr: string;
    setPage: (p: number) => void;
    setPageSizeStr: (s: string) => void;
  };
}

export function CartoesFlotaTabela({
  loading,
  cartoesLength,
  filtered,
  pageItems,
  sortField,
  sortDir,
  onSort,
  consumoOf,
  titularLabel,
  onEdit,
  onEntrega,
  onDevolucao,
  onHistory,
  onDeleteRequest,
  pagination,
}: CartoesFlotaTabelaProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16 text-sm text-muted-foreground">
        {cartoesLength === 0
          ? 'Nenhum cartão criado ainda. Clique em "Adicionar Cartão".'
          : 'Nenhum cartão encontrado.'}
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead field="tipo" sortField={sortField} sortDir={sortDir} onSort={onSort}>
              Tipo
            </SortableTableHead>
            <SortableTableHead
              field="numero"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            >
              Número
            </SortableTableHead>
            <SortableTableHead
              field="detentor"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            >
              Detentor
            </SortableTableHead>
            <SortableTableHead
              field="titular"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            >
              Titular
            </SortableTableHead>
            <SortableTableHead
              field="limite"
              align="right"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            >
              Plafond
            </SortableTableHead>
            <SortableTableHead
              field="consumo"
              align="right"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            >
              Consumo (mês)
            </SortableTableHead>
            <SortableTableHead
              field="validade"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            >
              Validade
            </SortableTableHead>
            <SortableTableHead
              field="status"
              sortField={sortField}
              sortDir={sortDir}
              onSort={onSort}
            >
              Status
            </SortableTableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageItems.map((c) => {
            const info = TIPO_INFO[c.tipo];
            const Icon = info.Icon;
            const titular = titularLabel(c);
            return (
              <TableRow
                key={c.id}
                onClick={() => onEdit(c)}
                className={`cursor-pointer hover:bg-muted/50 ${c.status === 'cancelado' ? 'opacity-55' : ''}`}
              >
                <TableCell>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${info.badgeCls}`}
                  >
                    <Icon className="h-3 w-3" />
                    {info.label}
                  </span>
                </TableCell>
                <TableCell className="font-mono font-medium text-sm">{c.numero}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.detentor || '-'}</TableCell>
                <TableCell>
                  {titular ? (
                    <span className="flex items-center gap-1.5 text-sm">
                      <UserCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate max-w-[160px]">{titular.texto}</span>
                      {titular.tipo === 'cliente' && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">
                          cliente
                        </Badge>
                      )}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <UserX className="h-3.5 w-3.5 shrink-0" />
                      Disponível
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {c.limite != null ? fmtEur(c.limite) : '-'}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {(() => {
                    const cons = consumoOf(c);
                    const lim = c.limite || 0;
                    const pct = lim > 0 ? Math.min(100, (cons / lim) * 100) : 0;
                    const barColor =
                      pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
                    return (
                      <div className="flex flex-col items-end gap-1 min-w-[80px]">
                        <span className={cons > 0 ? 'font-medium' : 'text-muted-foreground'}>
                          {cons > 0 ? fmtEur(cons) : '—'}
                        </span>
                        {lim > 0 && cons > 0 && (
                          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-sm">
                  {(() => {
                    if (!c.data_validade) return <span className="text-muted-foreground">-</span>;
                    const d = new Date(c.data_validade);
                    const now = new Date();
                    const months =
                      (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
                    const expired = d < now;
                    const soon = !expired && months <= 3;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 ${
                          expired
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : soon
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {(expired || soon) && <AlertTriangle className="h-3 w-3 shrink-0" />}
                        {fmtDate(c.data_validade)}
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_INFO[c.status]?.cls ?? STATUS_INFO.disponivel.cls}`}
                  >
                    {STATUS_INFO[c.status]?.label ?? c.status}
                  </span>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    {c.status !== 'cancelado' &&
                      (c.status === 'em_uso' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-amber-600 hover:text-amber-600"
                          onClick={() => onDevolucao(c)}
                          title="Devolver cartão"
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-blue-600 hover:text-blue-600"
                          onClick={() => onEntrega(c)}
                          title="Entregar a motorista"
                        >
                          <UserCheck className="h-4 w-4" />
                        </Button>
                      ))}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onHistory(c)}
                      title="Histórico de consumo"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEdit(c)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => onDeleteRequest(c)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {pagination.total > 0 && (
        <TablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          start={pagination.start}
          end={pagination.end}
          onPageChange={pagination.setPage}
          noun={['cartao', 'cartoes']}
          pageSizeStr={pagination.pageSizeStr}
          onPageSizeChange={pagination.setPageSizeStr}
        />
      )}
    </div>
  );
}
