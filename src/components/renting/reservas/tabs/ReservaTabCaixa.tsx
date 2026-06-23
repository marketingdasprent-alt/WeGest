import { useEffect, useMemo, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Receipt } from 'lucide-react';

import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { ReservaFormValues } from '../reservaDialog.schema';
import type { Estacao } from '@/hooks/useEstacoes';

function ivaRate(regime: string): number {
  return regime === 'tvde' || regime === 'slot' ? 0 : 0.23;
}

function diferencaDias(inicio: string, fim: string): number | null {
  if (!inicio || !fim) return null;
  const di = new Date(inicio).getTime();
  const df = new Date(fim).getTime();
  if (Number.isNaN(di) || Number.isNaN(df) || df <= di) return null;
  return Math.max(1, Math.ceil((df - di) / (1000 * 60 * 60 * 24)));
}

function formatEur(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '€0,00';
  return `€${value.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateShort(iso: string): string {
  if (!iso) return '?';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '?';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface ReservaTabCaixaProps {
  form: UseFormReturn<ReservaFormValues>;
  estacoes: Estacao[];
  reservaCodigo?: number | null;
}

export const ReservaTabCaixa: React.FC<ReservaTabCaixaProps> = ({
  form,
  estacoes: _estacoes,
  reservaCodigo,
}) => {
  const valorTotal = form.watch('valor_total');
  const dataInicio = form.watch('data_inicio');
  const dataFim = form.watch('data_fim');
  const regime = form.watch('regime');

  const dias = useMemo(() => diferencaDias(dataInicio, dataFim), [dataInicio, dataFim]);
  const total = valorTotal ?? 0;
  const taxaIVA = ivaRate(regime);
  const subtotal = taxaIVA > 0 && total > 0 ? total / (1 + taxaIVA) : total;
  const iva = total - subtotal;
  const precoUnitarioDerivado = dias && dias > 0 ? total / dias : 0;

  // Estado local para o input de preço unitário — permite editar livremente
  // sem ser sobrescrito por cada cálculo derivado.
  const [precoUnitInput, setPrecoUnitInput] = useState<string>(
    precoUnitarioDerivado > 0 ? precoUnitarioDerivado.toFixed(2) : ''
  );

  // Sincroniza o input quando valor_total ou dias mudam externamente.
  useEffect(() => {
    const novo = dias && dias > 0 && total > 0 ? (total / dias).toFixed(2) : '';
    setPrecoUnitInput(novo);
  }, [total, dias]);

  const handlePrecoUnitarioChange = (raw: string) => {
    // Aceita "," ou "." como separador decimal
    const normalized = raw.replace(',', '.').replace(/[^0-9.]/g, '');
    setPrecoUnitInput(normalized);
    if (!dias || dias <= 0) return;
    if (normalized === '' || normalized === '.') {
      form.setValue('valor_total', null, { shouldValidate: true });
      return;
    }
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0) return;
    const novoTotal = Number((n * dias).toFixed(2));
    form.setValue('valor_total', novoTotal, { shouldValidate: true });
  };

  const descricao = `Aluguer${reservaCodigo ? ` #${reservaCodigo}` : ''} · ${formatDateShort(dataInicio)} → ${formatDateShort(dataFim)}`;

  return (
    <div className="space-y-6">
      {/* Tabela Artigos */}
      <div>
        <div className="flex items-center gap-2 pb-2 border-b mb-3">
          <Receipt className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Artigos</h3>
          <span className="text-xs text-muted-foreground ml-auto italic">
            Preços com IVA incluído
          </span>
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 border-b">
                <TableHead className="text-xs font-semibold uppercase tracking-wide">
                  Descrição
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-center w-24">
                  Unidades
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-right w-40">
                  Preço Unit. (€)
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-center w-20">
                  IVA
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-right w-32">
                  Total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell className="font-medium align-middle">{descricao}</TableCell>
                <TableCell className="text-center align-middle text-muted-foreground tabular-nums">
                  {dias ?? '—'}
                </TableCell>
                <TableCell className="text-right align-middle">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={precoUnitInput}
                    onChange={(e) => handlePrecoUnitarioChange(e.target.value)}
                    disabled={!dias}
                    placeholder="0,00"
                    className="h-9 w-28 text-right ml-auto bg-background tabular-nums"
                    title={!dias ? 'Define primeiro as datas' : 'Preço por dia'}
                  />
                </TableCell>
                <TableCell className="text-center align-middle text-muted-foreground text-sm">
                  {(taxaIVA * 100).toFixed(0)}%
                </TableCell>
                <TableCell className="text-right align-middle font-semibold tabular-nums">
                  {formatEur(total || null)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Cálculos — caixa compacta alinhada à direita */}
      <div className="flex justify-end">
        <div className="w-full sm:w-[360px] rounded-lg border overflow-hidden bg-card">
          <div className="grid grid-cols-2 px-4 py-2 text-sm">
            <span className="text-muted-foreground">Sub-total</span>
            <span className="text-right tabular-nums">{formatEur(subtotal)}</span>
          </div>
          <div className="grid grid-cols-2 px-4 py-2 text-sm border-t">
            <span className="text-muted-foreground">Desconto</span>
            <span className="text-right text-muted-foreground text-xs self-center">0 %</span>
          </div>
          <div className="grid grid-cols-2 px-4 py-2 text-sm border-t">
            <span className="text-muted-foreground">Sub-total c/ desconto</span>
            <span className="text-right tabular-nums">{formatEur(subtotal)}</span>
          </div>
          <div className="grid grid-cols-2 px-4 py-2 text-sm border-t bg-muted/20">
            <span className="text-muted-foreground">IVA ({(taxaIVA * 100).toFixed(0)}%)</span>
            <span className="text-right tabular-nums">{formatEur(iva)}</span>
          </div>
          <div className="grid grid-cols-2 px-4 py-3 text-base font-semibold border-t bg-primary/5">
            <span>Total</span>
            <span className="text-right tabular-nums">{formatEur(total)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground italic">
        O total é calculado automaticamente a partir do preço unitário × dias. Linhas adicionais
        (extras, taxas, descontos persistentes) requerem expansão do modelo de dados — fica para
        fase futura.
      </p>
    </div>
  );
};
