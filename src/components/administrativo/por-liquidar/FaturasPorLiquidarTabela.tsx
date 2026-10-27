import { Fragment } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/utils/formatters';
import type { ClienteComFaturas } from '@/hooks/useFaturasPorLiquidar';

interface FaturasPorLiquidarTabelaProps {
  grupos: ClienteComFaturas[];
  selecionadas: Set<string>;
  onToggleFatura: (id: string) => void;
  onToggleCliente: (grupo: ClienteComFaturas) => void;
}

export const FaturasPorLiquidarTabela: React.FC<FaturasPorLiquidarTabelaProps> = ({
  grupos,
  selecionadas,
  onToggleFatura,
  onToggleCliente,
}) => {
  const totalGeral = grupos.reduce((s, g) => s + g.totalPendente, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Data</TableHead>
          <TableHead>Nº Doc.</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead className="text-right">Valor Total</TableHead>
          <TableHead className="text-right">Liquidado</TableHead>
          <TableHead className="text-right">Pendente</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {grupos.map((g) => {
          const marcadas = g.faturas.filter((f) => selecionadas.has(f.id)).length;
          return (
            <Fragment key={g.clienteId}>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableCell>
                  <Checkbox
                    aria-label={`Escolher todas as faturas de ${g.clienteNome}`}
                    checked={
                      marcadas === g.faturas.length ? true : marcadas > 0 ? 'indeterminate' : false
                    }
                    onCheckedChange={() => onToggleCliente(g)}
                  />
                </TableCell>
                <TableCell colSpan={5} className="font-semibold">
                  {g.clienteNome}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatCurrency(g.totalPendente)}
                </TableCell>
              </TableRow>
              {g.faturas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Escolher ${f.documento_externo_ref ?? 'fatura'}`}
                      checked={selecionadas.has(f.id)}
                      onCheckedChange={() => onToggleFatura(f.id)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(f.emitidaEm)}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {f.documento_externo_ref ?? 'Sem documento fiscal'}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate text-muted-foreground">
                    {f.descricao ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(f.valorTotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(f.pago + f.creditado)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(f.saldoPagar)}
                  </TableCell>
                </TableRow>
              ))}
            </Fragment>
          );
        })}
        <TableRow className="bg-foreground text-background hover:bg-foreground">
          <TableCell colSpan={6} className="font-semibold">
            Total
          </TableCell>
          <TableCell className="text-right font-bold tabular-nums">
            {formatCurrency(totalGeral)}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
};
