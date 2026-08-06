import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  /**
   * Chamado quando o utilizador escreve o preço unitário no cartão.
   * `null` significa "volta ao cálculo pela tarifa".
   */
  onValorTotalManualChange?: (valor: number | null) => void;
  /** Torna o preço editável no cartão. Por omissão o cartão é só-leitura. */
  editavel?: boolean;
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
  onValorTotalManualChange,
  editavel = false,
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
    const subtotalBrutoComDesconto = subtotalBruto - desconto;
    // Rent-a-Car: o preço da tarifa é SEM IVA — soma-se por cima. TVDE/slot:
    // o preço já vem com IVA incluído — decompõe-se (divide), nunca soma
    // (duplicaria o imposto). Mesma lógica da view contrato_renting_totais.
    const isRentACar = regime === 'rent_a_car';
    let subtotal: number;
    let iva: number;
    let totalComIva: number;
    if (isRentACar) {
      subtotal = subtotalBrutoComDesconto;
      iva = taxaIva > 0 ? subtotal * (taxaIva / 100) : 0;
      totalComIva = subtotal + iva;
    } else {
      totalComIva = subtotalBrutoComDesconto;
      subtotal = taxaIva > 0 ? totalComIva / (1 + taxaIva / 100) : totalComIva;
      iva = totalComIva - subtotal;
    }
    // Taxas incidem sobre o valor já com IVA e somam-se depois do IVA.
    const custoTaxas = taxas.reduce((soma, t) => soma + calcTaxaValor(t, totalComIva), 0);
    const total = totalComIva + custoTaxas;

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
    regime,
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

  // ── Preço unitário editável ───────────────────────────────────
  // Quando mudam as DATAS, é o preço unitário que manda e o total que se
  // refaz — ao contrário do cartão da reserva, onde manda o total. É
  // deliberado: esticar um contrato de 15 para 20 dias tem de cobrar mais, e
  // não redistribuir o mesmo total por mais dias. Já uma escrita vinda de fora
  // (hidratação, troca de viatura) manda sobre o input, desde que o utilizador
  // não o tenha em foco.
  const isRentACarPreco = regime === 'rent_a_car';
  // Calculado à parte de `calculo.dias`, que devolve 0 quando o contrato está
  // facturado — aí queremos continuar a mostrar o preço que ficou congelado.
  const diasPreco = dataInicio && dataFim ? calcDias(dataInicio, dataFim) : 0;
  const divisor = isRentACarPreco ? diasPreco : 1;

  const precoLabel = isRentACarPreco
    ? 'Preço/dia (sem IVA)'
    : regime === 'slot'
      ? 'Valor mensal (IVA inc.)'
      : 'Preço/semana (IVA inc.)';

  const [precoUnit, setPrecoUnit] = useState('');
  // Guarda de foco (igual à do cartão da reserva): enquanto o utilizador está a
  // escrever, o input manda e nada de fora lhe toca. Fora do foco, o input
  // segue o valor do formulário — é o que permite ver a tarifa nova quando se
  // troca de viatura (aplicarDadosViatura reescreve `valor_total_manual`).
  const inputFocused = useRef(false);
  // Último divisor visto, para distinguir "mudaram as datas" de "mudou o valor".
  const divisorAnterior = useRef(divisor);

  // As duas direcções vivem no MESMO efeito de propósito, porque a ordem entre
  // elas importa: no render em que o divisor muda, o valor que vem de fora
  // ainda é o do divisor antigo. Sincronizar o input aí daria 1275/20 = 63,75 —
  // o preço/dia mudava sozinho ao esticar as datas, exactamente o oposto do que
  // este cartão promete. Por isso a mudança de divisor trata-se primeiro e sai.
  useEffect(() => {
    const divisorMudou = divisorAnterior.current !== divisor;
    divisorAnterior.current = divisor;
    const preco = Number(precoUnit);
    const temPreco = precoUnit !== '' && Number.isFinite(preco) && preco > 0;

    // (1) Mudaram as datas e já há preço/dia: o preço fica quieto e é o total
    // que recalcula. Sem preço escrito não escreve nada — abrir o formulário e
    // mexer nas datas não pode inventar um valor manual do nada.
    if (divisorMudou && divisor > 0 && temPreco) {
      onValorTotalManualChange?.(Number((preco * divisor).toFixed(2)));
      return;
    }

    // (2) O valor mudou por fora (hidratação inicial, troca de viatura): o
    // input segue-o. Inclui o eco da nossa própria escrita do ramo (1), que
    // devolve exactamente o mesmo preço e portanto não mexe em nada.
    if (inputFocused.current) return;
    if (divisor <= 0 || valorTotalManual == null || valorTotalManual <= 0) return;
    setPrecoUnit((valorTotalManual / divisor).toFixed(2));
  }, [divisor, precoUnit, valorTotalManual, onValorTotalManualChange]);

  const handlePrecoChange = (raw: string) => {
    const normalizado = raw.replace(',', '.').replace(/[^0-9.]/g, '');
    setPrecoUnit(normalizado);
    if (divisor <= 0) return;
    if (normalizado === '' || normalizado === '.') {
      onValorTotalManualChange?.(null);
      return;
    }
    const n = Number(normalizado);
    if (!Number.isFinite(n) || n < 0) return;
    onValorTotalManualChange?.(Number((n * divisor).toFixed(2)));
  };

  const handlePrecoBlur = () => {
    inputFocused.current = false;
    const n = Number(precoUnit);
    setPrecoUnit(precoUnit && Number.isFinite(n) && n > 0 ? n.toFixed(2) : '');
  };

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

          {editavel ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs shrink-0">{precoLabel}</span>
                {/* O placeholder não promete a tarifa: `tarifa_diaria` nunca é
                    preenchido por contratos criados na aplicação (não há campo
                    que o escreva), por isso deixar o campo vazio dá Total
                    0,00 € e não o preço tarifário. */}
                <Input
                  type="text"
                  inputMode="decimal"
                  aria-label={precoLabel}
                  value={precoUnit}
                  onChange={(e) => handlePrecoChange(e.target.value)}
                  onFocus={() => {
                    inputFocused.current = true;
                  }}
                  onBlur={handlePrecoBlur}
                  disabled={isFacturado || divisor <= 0}
                  placeholder="0,00"
                  className="h-8 w-24 text-right tabular-nums text-sm"
                  title={
                    isFacturado
                      ? 'Contrato facturado — os valores estão congelados'
                      : divisor <= 0
                        ? 'Define primeiro as datas'
                        : undefined
                  }
                />
              </div>
              {isRentACarPreco ? (
                diasPreco > 0 ? (
                  <p className="text-muted-foreground text-xs text-right">
                    × {diasPreco} dia{diasPreco === 1 ? '' : 's'}
                  </p>
                ) : (
                  <p className="text-amber-600 dark:text-amber-400 text-xs text-right">
                    Define as datas primeiro
                  </p>
                )
              ) : regime === 'tvde' ? (
                <p className="text-muted-foreground text-xs text-right">× 1 semana</p>
              ) : null}
            </>
          ) : showsManual ? (
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
