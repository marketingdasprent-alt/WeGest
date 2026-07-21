import { useMemo, useState } from 'react';
import { Loader2, History } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import {
  fmtEur,
  fmtDT,
  TIPO_INFO,
  type CartaoFrota,
  type HistoricoItem,
} from './cartoesFlotaTab.types';

interface CartaoHistoricoSheetProps {
  historyCartao: CartaoFrota | null;
  onOpenChange: (open: boolean) => void;
  loadingHistory: boolean;
  historico: HistoricoItem[];
  totalHistorico: number;
}

export function CartaoHistoricoSheet({
  historyCartao,
  onOpenChange,
  loadingHistory,
  historico,
  totalHistorico,
}: CartaoHistoricoSheetProps) {
  const [sortField, setSortField] = useState<string>('transaction_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  const sortedHistorico = useMemo(() => {
    const list = [...historico];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'transaction_date') {
        va = a.transaction_date || '';
        vb = b.transaction_date || '';
      } else if (sortField === 'station_name') {
        va = a.station_name || '';
        vb = b.station_name || '';
      } else if (sortField === 'fuel_type') {
        va = a.fuel_type || '';
        vb = b.fuel_type || '';
      } else if (sortField === 'quantity') {
        va = a.quantity ?? 0;
        vb = b.quantity ?? 0;
      } else if (sortField === 'amount') {
        va = a.amount ?? 0;
        vb = b.amount ?? 0;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [historico, sortField, sortDir]);

  return (
    <Sheet open={!!historyCartao} onOpenChange={(o) => !o && onOpenChange(false)}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <History className="h-5 w-5 text-muted-foreground" />
            Histórico de Consumo
            {historyCartao && (
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_INFO[historyCartao.tipo].badgeCls}`}
              >
                {TIPO_INFO[historyCartao.tipo].label} · {historyCartao.numero}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {loadingHistory ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : historico.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Sem transações registadas para este cartão.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto -mx-6 px-6 mt-4">
            <div className="flex justify-between items-center text-sm mb-3 px-1">
              <span className="text-muted-foreground">{historico.length} transação(ões)</span>
              <span className="font-semibold">{fmtEur(totalHistorico)}</span>
            </div>
            {historyCartao?.limite != null && (
              <div className="mb-3 px-1 text-xs text-muted-foreground">
                Limite: <strong>{fmtEur(historyCartao.limite)}</strong>
                {' · '}
                Consumido:{' '}
                <strong
                  className={
                    totalHistorico > historyCartao.limite ? 'text-destructive' : 'text-foreground'
                  }
                >
                  {fmtEur(totalHistorico)}
                </strong>
                {' · '}
                Disponível: <strong>{fmtEur(historyCartao.limite - totalHistorico)}</strong>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    field="transaction_date"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Data
                  </SortableTableHead>
                  <SortableTableHead
                    field="station_name"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Posto
                  </SortableTableHead>
                  <SortableTableHead
                    field="fuel_type"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Combust.
                  </SortableTableHead>
                  <SortableTableHead
                    field="quantity"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    align="right"
                  >
                    Litros
                  </SortableTableHead>
                  <SortableTableHead
                    field="amount"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    align="right"
                  >
                    Valor
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedHistorico.map((h, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {fmtDT(h.transaction_date)}
                    </TableCell>
                    <TableCell className="text-xs max-w-[140px] truncate">
                      {h.station_name || '-'}
                    </TableCell>
                    <TableCell className="text-xs">{h.fuel_type || '-'}</TableCell>
                    <TableCell className="text-xs text-right">
                      {h.quantity != null ? Number(h.quantity).toFixed(2) : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {fmtEur(h.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
