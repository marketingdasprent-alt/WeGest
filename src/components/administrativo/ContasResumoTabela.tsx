import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { cn } from '@/lib/utils';
import type { MotoristaResumo } from './contasResumoExports';

export type SortField =
  | 'driver_name'
  | 'total_faturado'
  | 'liquido'
  | 'aluguer'
  | 'combustivel'
  | 'portagens'
  | 'outros_custos'
  | 'reparacoes'
  | 'gorjeta';

interface ContasResumoTabelaProps {
  filteredResumos: MotoristaResumo[];
  pageItems: MotoristaResumo[];
  sortField: SortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: SortField) => void;
  selectedIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSelectOne: (id: string) => void;
  onRowClick: (resumo: MotoristaResumo) => void;
  formatCurrency: (value: number) => string;
  /** Coluna Gorjeta — dados sensíveis, só para admins da org dona dos dados. */
  showGorjeta?: boolean;
}

export function ContasResumoTabela({
  filteredResumos,
  pageItems,
  sortField,
  sortDir,
  onSort,
  selectedIds,
  onToggleSelectAll,
  onToggleSelectOne,
  onRowClick,
  formatCurrency,
  showGorjeta = false,
}: ContasResumoTabelaProps) {
  const handleSort = (f: string) => onSort(f as SortField);

  return (
    <>
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={
                    selectedIds.size === filteredResumos.length && filteredResumos.length > 0
                  }
                  onCheckedChange={onToggleSelectAll}
                />
              </TableHead>
              <SortableTableHead
                field="driver_name"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Nome
              </SortableTableHead>
              <SortableTableHead
                field="total_faturado"
                align="right"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Faturado
              </SortableTableHead>
              {showGorjeta && (
                <SortableTableHead
                  field="gorjeta"
                  align="right"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  Gorjeta
                </SortableTableHead>
              )}
              <SortableTableHead
                field="liquido"
                align="right"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Líquido
              </SortableTableHead>
              <SortableTableHead
                field="aluguer"
                align="right"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Aluguer
              </SortableTableHead>
              <SortableTableHead
                field="combustivel"
                align="right"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Combustível
              </SortableTableHead>
              <SortableTableHead
                field="portagens"
                align="right"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Portagens
              </SortableTableHead>
              <SortableTableHead
                field="outros_custos"
                align="right"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Outros Custos
              </SortableTableHead>
              <SortableTableHead
                field="reparacoes"
                align="right"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
              >
                Reparações
              </SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredResumos.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showGorjeta ? 10 : 9}
                  className="text-center py-8 text-muted-foreground"
                >
                  Nenhum dado encontrado para o período selecionado
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((resumo, idx) => {
                const rowId = resumo._uid || `row-${idx}`;
                return (
                  <TableRow
                    key={rowId}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-muted/50',
                      resumo.liquido < 0 && '[box-shadow:inset_4px_0_0_0_#ef4444]'
                    )}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(rowId)}
                        onCheckedChange={() => onToggleSelectOne(rowId)}
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        'font-bold',
                        resumo.recibo_verde ? 'text-green-600' : 'text-orange-500'
                      )}
                      onClick={() => onRowClick(resumo)}
                    >
                      {resumo.driver_name}
                    </TableCell>
                    <TableCell className="text-right" onClick={() => onRowClick(resumo)}>
                      <span className="text-green-600 font-medium">
                        {formatCurrency(resumo.total_faturado)}
                      </span>
                      {resumo.faturado_bolt > 0 && resumo.faturado_uber > 0 && (
                        <div className="text-xs text-muted-foreground">
                          B: {formatCurrency(resumo.faturado_bolt)} | U:{' '}
                          {formatCurrency(resumo.faturado_uber)}
                        </div>
                      )}
                    </TableCell>
                    {showGorjeta && (
                      <TableCell className="text-right" onClick={() => onRowClick(resumo)}>
                        {resumo.gorjeta_bolt + resumo.gorjeta_uber > 0 ? (
                          <span className="font-medium text-emerald-600">
                            {formatCurrency(resumo.gorjeta_bolt + resumo.gorjeta_uber)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">€0,00</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell
                      className={cn('text-right font-bold', resumo.liquido < 0 && 'text-red-500')}
                      onClick={() => onRowClick(resumo)}
                    >
                      {formatCurrency(resumo.liquido)}
                    </TableCell>
                    <TableCell className="text-right" onClick={() => onRowClick(resumo)}>
                      {resumo.aluguer > 0 ? (
                        <span className="font-medium text-green-600">
                          {formatCurrency(resumo.aluguer)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">€0,00</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={() => onRowClick(resumo)}>
                      {resumo.combustivel > 0 ? (
                        <span className="font-medium text-green-600">
                          {formatCurrency(resumo.combustivel)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">€0,00</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={() => onRowClick(resumo)}>
                      {resumo.portagens > 0 ? (
                        <span className="font-medium text-green-600">
                          {formatCurrency(resumo.portagens)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">€0,00</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={() => onRowClick(resumo)}>
                      {resumo.outros_custos > 0 ? (
                        <span className="font-medium text-green-600">
                          {formatCurrency(resumo.outros_custos)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">€0,00</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={() => onRowClick(resumo)}>
                      {resumo.reparacoes > 0 ? (
                        <span className="font-medium text-green-600">
                          {formatCurrency(resumo.reparacoes)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">€0,00</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-3">
        {filteredResumos.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum dado encontrado para o período selecionado
            </CardContent>
          </Card>
        ) : (
          pageItems.map((resumo, idx) => {
            const rowId = resumo._uid || `row-${idx}`;
            return (
              <Card
                key={rowId}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-muted/50',
                  resumo.liquido < 0 && 'border-l-4 border-l-red-500'
                )}
              >
                <CardContent className="pt-4 pb-3 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(rowId)}
                          onCheckedChange={() => onToggleSelectOne(rowId)}
                        />
                      </div>
                      <div onClick={() => onRowClick(resumo)}>
                        <div
                          className={cn(
                            'font-bold',
                            resumo.recibo_verde ? 'text-green-600' : 'text-orange-500'
                          )}
                        >
                          {resumo.driver_name}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="space-y-1.5 text-sm border-t pt-3"
                    onClick={() => onRowClick(resumo)}
                  >
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Faturado</span>
                      <span className="font-medium text-green-600">
                        {formatCurrency(resumo.total_faturado)}
                      </span>
                    </div>
                    {resumo.faturado_bolt > 0 && resumo.faturado_uber > 0 && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Bolt: {formatCurrency(resumo.faturado_bolt)}</span>
                        <span>Uber: {formatCurrency(resumo.faturado_uber)}</span>
                      </div>
                    )}
                    {showGorjeta && resumo.gorjeta_bolt + resumo.gorjeta_uber > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gorjeta</span>
                        <span className="font-medium text-emerald-600">
                          {formatCurrency(resumo.gorjeta_bolt + resumo.gorjeta_uber)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div
                    className="flex justify-between border-t pt-3"
                    onClick={() => onRowClick(resumo)}
                  >
                    <span className="font-semibold">Líquido</span>
                    <span
                      className={cn(
                        'font-bold',
                        resumo.liquido < 0 ? 'text-red-500' : 'text-primary'
                      )}
                    >
                      {formatCurrency(resumo.liquido)}
                    </span>
                  </div>

                  <div
                    className="space-y-1.5 text-sm border-t pt-3"
                    onClick={() => onRowClick(resumo)}
                  >
                    {resumo.aluguer > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Aluguer</span>
                        <span className="text-purple-600">-{formatCurrency(resumo.aluguer)}</span>
                      </div>
                    )}
                    {resumo.combustivel > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Combustível</span>
                        <span className="text-orange-600">
                          -{formatCurrency(resumo.combustivel)}
                        </span>
                      </div>
                    )}
                    {resumo.portagens > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Portagens</span>
                        <span className="text-green-700">-{formatCurrency(resumo.portagens)}</span>
                      </div>
                    )}
                    {resumo.outros_custos > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Outros Custos</span>
                        <span className="text-destructive">
                          -{formatCurrency(resumo.outros_custos)}
                        </span>
                      </div>
                    )}
                    {resumo.reparacoes > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reparações</span>
                        <span className="text-red-600">-{formatCurrency(resumo.reparacoes)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
