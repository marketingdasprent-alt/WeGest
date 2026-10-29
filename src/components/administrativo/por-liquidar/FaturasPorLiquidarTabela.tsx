import { Fragment } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { numeroCurto } from '@/utils/numeroDocumento';
import type { ClienteComFaturas, FaturaPorLiquidar } from '@/hooks/useFaturasPorLiquidar';

interface FaturasPorLiquidarTabelaProps {
  grupos: ClienteComFaturas[];
  loading?: boolean;
  selecionadas: Set<string>;
  onToggleFatura: (id: string) => void;
  onToggleCliente: (grupo: ClienteComFaturas) => void;
  onVerPdf: (fatura: FaturaPorLiquidar) => void;
  /** Fatura cujo PDF está a abrir. */
  pdfAAbrir: string | null;
}

const COLS = 7;

/** Tabela no padrão de FaturacaoTabela, agrupada por cliente como o mapa do KeyInvoice. */
export function FaturasPorLiquidarTabela({
  grupos,
  loading,
  selecionadas,
  onToggleFatura,
  onToggleCliente,
  onVerPdf,
  pdfAAbrir,
}: FaturasPorLiquidarTabelaProps) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="whitespace-nowrap">Nº Doc.</TableHead>
            <TableHead className="whitespace-nowrap">Data</TableHead>
            <TableHead>Descritivo</TableHead>
            <TableHead className="whitespace-nowrap text-right">Valor Total</TableHead>
            <TableHead className="whitespace-nowrap text-right">Pendente</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={`sk-${i}`}>
                {Array.from({ length: COLS }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full min-w-[40px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : grupos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLS} className="h-32 text-center text-muted-foreground">
                Sem faturas por liquidar para os filtros selecionados.
              </TableCell>
            </TableRow>
          ) : (
            grupos.map((g) => {
              const marcadas = g.faturas.filter((f) => selecionadas.has(f.id)).length;
              return (
                <Fragment key={g.clienteId}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell>
                      <Checkbox
                        aria-label={`Escolher todas as faturas de ${g.clienteNome}`}
                        checked={
                          marcadas === g.faturas.length
                            ? true
                            : marcadas > 0
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={() => onToggleCliente(g)}
                      />
                    </TableCell>
                    <TableCell colSpan={4} className="font-semibold">
                      {g.clienteNome}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {g.faturas.length} {g.faturas.length === 1 ? 'fatura' : 'faturas'}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold">
                      {formatCurrency(g.totalPendente)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  {g.faturas.map((f) => (
                    <TableRow
                      key={f.id}
                      data-state={selecionadas.has(f.id) ? 'selected' : undefined}
                      className="cursor-pointer"
                      onClick={() => onToggleFatura(f.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Escolher ${numeroCurto(f.documento_externo_ref)}`}
                          checked={selecionadas.has(f.id)}
                          onCheckedChange={() => onToggleFatura(f.id)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {numeroCurto(f.documento_externo_ref)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(f.emitidaEm)}
                      </TableCell>
                      <TableCell className="max-w-[320px]">
                        <span
                          className="block truncate text-sm text-muted-foreground"
                          title={f.descricao ?? ''}
                        >
                          {f.descricao ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {formatCurrency(f.valorTotal)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'whitespace-nowrap text-right font-medium',
                          f.saldoPagar < f.valorTotal && 'text-amber-600 dark:text-amber-400'
                        )}
                        title={
                          f.saldoPagar < f.valorTotal
                            ? `Já abatido ${formatCurrency(f.pago + f.creditado)}`
                            : undefined
                        }
                      >
                        {formatCurrency(f.saldoPagar)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {f.documento_externo_ref && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5"
                            aria-label={`Ver PDF de ${f.documento_externo_ref}`}
                            disabled={pdfAAbrir === f.id}
                            onClick={() => onVerPdf(f)}
                          >
                            {pdfAAbrir === f.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                            PDF
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
