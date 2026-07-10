import { useMemo } from 'react';
import { Lock } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { calcExtraTotal } from '@/hooks/useContratoExtras';
import { calcTaxaValor } from '@/hooks/useContratoTaxas';
import type { ExtraFormItem, TaxaFormItem } from '@/types/contratoRenting';
import { formatCurrency } from './contratosUtils';

interface ResumoContratoProps {
  dataInicio: string | null | undefined;
  dataFim: string | null | undefined;
  tarifaDiaria: number | null | undefined;
  valorTotalManual: number | null | undefined;
  descontoPercentagem: number | null | undefined;
  taxaIva: number;
  regime?: string;
  /** Soma do preço/dia das coberturas seleccionadas (× dias = custo total) */
  coberturasPrecoDia?: number;
  /** Extras seleccionados — custo calculado por tipo (dia/fixo) */
  extras?: ExtraFormItem[];
  /** Taxas seleccionadas — % do subtotal ou valor fixo, somadas após o IVA */
  taxas?: TaxaFormItem[];
  /** Se o contrato está facturado, totais estão congelados — UI mostra cadeado */
  isFacturado?: boolean;
  /** Snapshot do total final quando facturado (vem da BD, não recalcula) */
  totalSnapshot?: number | null;
  subtotalSnapshot?: number | null;
  ivaSnapshot?: number | null;
}

/**
 * Calcula dias entre 2 datas com ceil (1d+1h = 2 dias).
 * Espelha public.fn_contrato_dias() na BD.
 */
function calcDias(inicio: string, fim: string): number {
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 86400000));
}

export const ResumoContrato: React.FC<ResumoContratoProps> = ({
  dataInicio,
  dataFim,
  tarifaDiaria,
  valorTotalManual,
  descontoPercentagem,
  taxaIva,
  regime = 'rent_a_car',
  coberturasPrecoDia = 0,
  extras = [],
  taxas = [],
  isFacturado = false,
  totalSnapshot,
  subtotalSnapshot,
  ivaSnapshot,
}) => {
  const calculo = useMemo(() => {
    if (isFacturado && totalSnapshot != null) {
      return {
        dias: 0,
        baseAluguer: subtotalSnapshot ?? 0,
        custoCoberturas: 0,
        custoExtras: 0,
        custoTaxas: 0,
        subtotalBruto: subtotalSnapshot ?? 0,
        desconto: 0,
        subtotal: subtotalSnapshot ?? 0,
        iva: ivaSnapshot ?? 0,
        total: totalSnapshot,
      };
    }

    // TVDE/slot não têm data de fim (contrato aberto) — não bloqueia o cálculo,
    // já que nesses regimes o valor vem de valorTotalManual, não de dias×tarifa.
    if (!dataInicio) {
      return {
        dias: 0,
        baseAluguer: 0,
        custoCoberturas: 0,
        custoExtras: 0,
        custoTaxas: 0,
        subtotalBruto: 0,
        desconto: 0,
        subtotal: 0,
        iva: 0,
        total: 0,
      };
    }

    const dias = dataFim ? calcDias(dataInicio, dataFim) : 0;
    const baseAluguer =
      valorTotalManual != null && valorTotalManual > 0
        ? valorTotalManual
        : (tarifaDiaria ?? 0) * dias;
    const custoCoberturas = coberturasPrecoDia * dias;
    const custoExtras = extras.reduce((soma, e) => soma + calcExtraTotal(e, dias), 0);
    const subtotalBruto = baseAluguer + custoCoberturas + custoExtras;
    const descontoPct = descontoPercentagem ?? 0;
    const desconto = subtotalBruto * (descontoPct / 100);
    const subtotal = subtotalBruto - desconto;
    const iva = subtotal * (taxaIva / 100);
    // Taxas incidem sobre o subtotal e somam-se depois do IVA.
    const custoTaxas = taxas.reduce((soma, t) => soma + calcTaxaValor(t, subtotal), 0);
    const total = subtotal + iva + custoTaxas;

    return {
      dias,
      baseAluguer: Math.round(baseAluguer * 100) / 100,
      custoCoberturas: Math.round(custoCoberturas * 100) / 100,
      custoExtras: Math.round(custoExtras * 100) / 100,
      custoTaxas: Math.round(custoTaxas * 100) / 100,
      subtotalBruto: Math.round(subtotalBruto * 100) / 100,
      desconto: Math.round(desconto * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }, [
    dataInicio,
    dataFim,
    tarifaDiaria,
    valorTotalManual,
    descontoPercentagem,
    taxaIva,
    coberturasPrecoDia,
    extras,
    taxas,
    isFacturado,
    totalSnapshot,
    subtotalSnapshot,
    ivaSnapshot,
  ]);

  const showsManual = valorTotalManual != null && valorTotalManual > 0 && !isFacturado;

  return (
    <Card className="bg-card border-border sticky top-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Resumo do contrato
          </h3>
          {isFacturado && (
            <span className="inline-flex items-center gap-1 text-xs text-indigo-700 dark:text-indigo-300">
              <Lock className="h-3 w-3" />
              Facturado
            </span>
          )}
        </div>

        <div className="rounded-md bg-muted/40 px-3 py-2 mb-3 text-center">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-2xl font-semibold text-foreground">
            {formatCurrency(calculo.total)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">IVA incluído</div>
        </div>

        <div className="space-y-1.5 text-sm">
          {!isFacturado && regime !== 'tvde' && regime !== 'slot' && (
            <Row label={`Dias`} value={String(calculo.dias)} muted />
          )}

          {showsManual ? (
            <Row
              label={regime === 'tvde' || regime === 'slot' ? 'Valor semanal' : 'Valor manual'}
              value={formatCurrency(valorTotalManual ?? 0)}
              muted
            />
          ) : isFacturado ? (
            <Row label="Subtotal bruto" value={formatCurrency(calculo.subtotalBruto)} muted />
          ) : (
            <Row
              label={regime === 'tvde' ? 'Aluguer (semanal)' : 'Aluguer'}
              value={formatCurrency(calculo.baseAluguer)}
              muted
            />
          )}

          {!isFacturado && calculo.custoCoberturas > 0 && (
            <Row label="Coberturas" value={formatCurrency(calculo.custoCoberturas)} muted />
          )}

          {!isFacturado && calculo.custoExtras > 0 && (
            <Row label="Extras" value={formatCurrency(calculo.custoExtras)} muted />
          )}

          {!isFacturado && (descontoPercentagem ?? 0) > 0 && (
            <Row
              label={`Desconto (${descontoPercentagem}%)`}
              value={`− ${formatCurrency(calculo.desconto)}`}
              muted
            />
          )}

          <div className="border-t border-border/50 my-1" />

          <Row label="Subtotal" value={formatCurrency(calculo.subtotal)} />
          <Row label={`IVA (${taxaIva}%)`} value={formatCurrency(calculo.iva)} muted />

          {!isFacturado && calculo.custoTaxas > 0 && (
            <Row label="Taxas" value={formatCurrency(calculo.custoTaxas)} muted />
          )}

          <div className="border-t border-border/50 my-1" />

          <Row label="Total" value={formatCurrency(calculo.total)} strong />
        </div>
      </CardContent>
    </Card>
  );
};

interface RowProps {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}

const Row: React.FC<RowProps> = ({ label, value, muted, strong }) => (
  <div className="flex items-center justify-between">
    <span className={muted ? 'text-muted-foreground text-xs' : 'text-foreground text-sm'}>
      {label}
    </span>
    <span
      className={
        strong
          ? 'font-semibold text-foreground'
          : muted
            ? 'text-muted-foreground text-xs'
            : 'text-foreground text-sm'
      }
    >
      {value}
    </span>
  </div>
);
