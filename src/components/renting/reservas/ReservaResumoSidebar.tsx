import { useEffect, useMemo, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { AlertTriangle, Calculator, Check } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { calcExtraTotal } from '@/hooks/useReservaExtras';
import { calcTaxaValor } from '@/hooks/useReservaTaxas';
import type { ReservaFormValues } from './reservaDialog.schema';
import type { Estacao } from '@/hooks/useEstacoes';
import type { ViaturaBasic } from '@/hooks/useViaturas';

interface ReservaResumoSidebarProps {
  form: UseFormReturn<ReservaFormValues>;
  estacoes: Estacao[];
  viaturas: ViaturaBasic[];
  isEdit: boolean;
}

function ivaRate(regime: string): number {
  // TVDE já tem IVA incluído no preço (decompõe-se mais abaixo, não soma).
  // Slot tem tratamento próprio (ver isSlot, mais abaixo).
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

function formatHora(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ReservaResumoSidebar: React.FC<ReservaResumoSidebarProps> = ({
  form,
  estacoes,
  viaturas,
  isEdit,
}) => {
  const estacaoEntregaId = form.watch('estacao_entrega_id');
  const estacaoRecolhaId = form.watch('estacao_recolha_id');
  const dataInicio = form.watch('data_inicio');
  const dataFim = form.watch('data_fim');
  const valorTotal = form.watch('valor_total');
  const grupo = form.watch('grupo');
  const viaturaId = form.watch('viatura_id');
  const kmsIncluidos = form.watch('kms_incluidos');
  const franquiaValor = form.watch('franquia_valor');
  const caucaoValor = form.watch('caucao_valor');
  const longaDuracao = form.watch('is_longa_duracao');
  const regime = form.watch('regime');
  const slotValorMensal = form.watch('slot_valor_mensal');
  const isSlot = regime === 'slot';
  const isTvde = regime === 'tvde';

  const estacaoEntrega = useMemo(
    () => estacoes.find((e) => e.id === estacaoEntregaId),
    [estacoes, estacaoEntregaId]
  );
  const estacaoRecolha = useMemo(
    () => estacoes.find((e) => e.id === estacaoRecolhaId),
    [estacoes, estacaoRecolhaId]
  );
  const viatura = useMemo(() => viaturas.find((v) => v.id === viaturaId), [viaturas, viaturaId]);

  const dias = diferencaDias(dataInicio, dataFim);
  // Valor guardado no formulário — Rent-a-Car: preço SEM IVA (o que se
  // digita). Slot/TVDE: preço já com IVA incluído (inalterado).
  const rawTotal = isSlot ? (slotValorMensal ?? 0) : (valorTotal ?? 0);
  const isRentACar = regime === 'rent_a_car';
  const taxaIVA = isSlot ? 0.23 : ivaRate(regime);

  // Coberturas/extras somam-se ao valor base antes do IVA (mesmo bruto que
  // se decompõe/soma consoante o regime) — taxas somam-se depois do IVA.
  // Mesma lógica do ResumoContrato.tsx, agora também na reserva.
  const coberturas = form.watch('coberturas') ?? [];
  const extras = form.watch('extras') ?? [];
  const taxas = form.watch('taxas') ?? [];
  const custoCoberturas = coberturas.reduce((s, c) => s + (c.preco_dia ?? 0), 0) * (dias ?? 0);
  const custoExtras = extras.reduce((s, e) => s + calcExtraTotal(e, dias ?? 0), 0);
  const brutoComExtras = rawTotal + custoCoberturas + custoExtras;

  // Preço base (sem coberturas/extras) — só para as linhas "Preço/dia",
  // "Preço/semana" e "Valor mensal" (o valor unitário editável/tarifário).
  let subtotalBase: number;
  let ivaBase: number;
  let totalBase: number;
  if (isRentACar && taxaIVA > 0) {
    subtotalBase = rawTotal;
    ivaBase = subtotalBase * taxaIVA;
    totalBase = subtotalBase + ivaBase;
  } else {
    totalBase = rawTotal;
    subtotalBase = taxaIVA > 0 && totalBase > 0 ? totalBase / (1 + taxaIVA) : totalBase;
    ivaBase = totalBase - subtotalBase;
  }

  // Rent-a-Car: soma-se o IVA por cima do bruto (líquido, já com coberturas/
  // extras) — "Total" aqui é maior que o campo editável. TVDE/slot: o bruto
  // já é o total (com IVA) — decompõe-se (divide) só para mostrar Subtotal/
  // IVA, sem alterar o total. Taxas somam-se por fim, já depois do IVA.
  let subtotal: number;
  let iva: number;
  let totalComIva: number;
  if (isRentACar && taxaIVA > 0) {
    subtotal = brutoComExtras;
    iva = subtotal * taxaIVA;
    totalComIva = subtotal + iva;
  } else {
    totalComIva = brutoComExtras;
    subtotal = taxaIVA > 0 && totalComIva > 0 ? totalComIva / (1 + taxaIVA) : totalComIva;
    iva = totalComIva - subtotal;
  }
  const custoTaxas = taxas.reduce((s, t) => s + calcTaxaValor(t, totalComIva), 0);
  const total = totalComIva + custoTaxas;

  const horaEntrega = formatHora(dataInicio);
  const horaRecolha = formatHora(dataFim);

  const inputFocused = useRef(false);
  const [precoUnitInput, setPrecoUnitInput] = useState<string>('');

  // Só sincroniza quando o input não está em foco (mudança externa, ex: carregar dados)
  useEffect(() => {
    if (inputFocused.current) return;
    const novo = dias && dias > 0 && rawTotal > 0 ? (rawTotal / dias).toFixed(2) : '';
    setPrecoUnitInput(novo);
  }, [rawTotal, dias]);

  const handlePrecoUnitarioChange = (raw: string) => {
    const normalized = raw.replace(',', '.').replace(/[^0-9.]/g, '');
    setPrecoUnitInput(normalized);
    if (!dias || dias <= 0) return;
    if (normalized === '' || normalized === '.') {
      form.setValue('valor_total', null, { shouldValidate: true });
      return;
    }
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0) return;
    form.setValue('valor_total', Number((n * dias).toFixed(2)), { shouldValidate: true });
  };

  const handlePrecoBlur = () => {
    inputFocused.current = false;
    // Formata ao sair do campo
    const n = Number(precoUnitInput);
    if (precoUnitInput && Number.isFinite(n) && n > 0) {
      setPrecoUnitInput(n.toFixed(2));
    } else if (!precoUnitInput || n === 0) {
      setPrecoUnitInput('');
    }
  };

  return (
    <aside className="space-y-3">
      <Card className="overflow-hidden">
        <div className="px-4 py-3 bg-muted/40 border-b">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Resumo da Reserva
          </p>
        </div>
        <div className="px-4 py-3 bg-muted/20 border-b text-center text-sm font-medium">
          Total: {formatEur(total)}
          {isSlot && <span className="text-muted-foreground">/mês</span>}{' '}
          <span className="text-muted-foreground">(IVA inc.)</span>
        </div>

        <div className="m-3 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
          <Calculator className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            A reserva <strong>{isEdit ? '' : 'ainda '}não foi faturada</strong>.
            <br />
            Restante a pagar: <strong>{formatEur(total)}</strong>
          </span>
        </div>

        <div className="px-4 py-3 space-y-3 text-sm border-t">
          <div>
            <p className="text-xs font-semibold text-foreground">
              {isSlot ? 'Início do slot' : 'Entrega'}
            </p>
            <div className="flex items-center justify-between mt-0.5">
              {!isSlot && (
                <span className={cn(!estacaoEntrega && 'text-muted-foreground italic')}>
                  {estacaoEntrega?.nome ?? 'Estação?'}
                </span>
              )}
              {horaEntrega ? (
                <span className="text-xs text-muted-foreground">{horaEntrega}</span>
              ) : (
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Hora?
                </span>
              )}
            </div>
          </div>

          {!isSlot && (
            <div>
              <p className="text-xs font-semibold text-foreground">Recolha</p>
              <div className="flex items-center justify-between mt-0.5">
                <span className={cn(!estacaoRecolha && 'text-muted-foreground italic')}>
                  {estacaoRecolha?.nome ?? 'Estação?'}
                </span>
                {horaRecolha ? (
                  <span className="text-xs text-muted-foreground">{horaRecolha}</span>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Hora?
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 space-y-2 text-sm border-t">
          {!isSlot && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Grupo</p>
                <p className="text-xs font-semibold text-foreground">Kms Permitidos</p>
              </div>
              <div className="flex items-center justify-between text-sm">
                {grupo ? (
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3 text-emerald-500" />
                    {grupo}
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 italic flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Grupo?
                  </span>
                )}
                <span className="text-muted-foreground">
                  {kmsIncluidos && kmsIncluidos > 0
                    ? `${kmsIncluidos.toLocaleString('pt-PT')} km`
                    : 'Ilimitados'}
                </span>
              </div>
            </>
          )}
          {isSlot && (
            <p className="text-xs text-muted-foreground italic">
              Carro próprio do motorista (slot) — sem grupo nem estações.
            </p>
          )}
          {viatura && (
            <p className="text-xs text-muted-foreground">
              Viatura: <span className="font-mono">{viatura.matricula}</span>
            </p>
          )}
          {dias && (
            <p className="text-xs text-muted-foreground">
              Duração: <strong>{dias}</strong> dia{dias === 1 ? '' : 's'}
              {longaDuracao && <span className="ml-2 text-primary">· Longa duração</span>}
            </p>
          )}
          {(franquiaValor || caucaoValor) && (
            <div className="text-xs text-muted-foreground pt-1 border-t mt-2 grid grid-cols-2 gap-1">
              {franquiaValor !== null && franquiaValor !== undefined && franquiaValor > 0 && (
                <div>
                  Franquia: <strong>{formatEur(franquiaValor)}</strong>
                </div>
              )}
              {caucaoValor !== null && caucaoValor !== undefined && caucaoValor > 0 && (
                <div>
                  Caução: <strong>{formatEur(caucaoValor)}</strong>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t">
          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/30">
            Preço
          </div>
          <div className="px-4 py-2.5 border-t space-y-1">
            {isSlot ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground shrink-0">
                  Valor mensal (IVA inc.)
                </span>
                <span className="text-sm font-medium tabular-nums">{formatEur(totalBase)}</span>
              </div>
            ) : isTvde ? (
              // TVDE: o preço/semana vem do modelo na tarifa — é fixo e não
              // depende das datas. Mostra só leitura, sem input nem aviso.
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">
                    Preço/semana (IVA inc.)
                  </span>
                  <span className="text-sm font-medium tabular-nums">{formatEur(totalBase)}</span>
                </div>
                {totalBase > 0 ? (
                  <p className="text-xs text-muted-foreground text-right">× 1 semana</p>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 text-right flex items-center justify-end gap-1">
                    <AlertTriangle className="h-3 w-3" /> Escolhe a tarifa e a viatura
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">Preço/dia (sem IVA)</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={precoUnitInput}
                    onChange={(e) => handlePrecoUnitarioChange(e.target.value)}
                    onFocus={() => {
                      inputFocused.current = true;
                    }}
                    onBlur={handlePrecoBlur}
                    disabled={!dias}
                    placeholder="0,00"
                    className="h-8 w-24 text-right tabular-nums text-sm"
                    title={!dias ? 'Define primeiro as datas' : 'Preço por dia (sem IVA) — o IVA soma-se no total'}
                  />
                </div>
                {dias ? (
                  <p className="text-xs text-muted-foreground text-right">
                    × {dias} dia{dias === 1 ? '' : 's'}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 text-right flex items-center justify-end gap-1">
                    <AlertTriangle className="h-3 w-3" /> Define as datas primeiro
                  </p>
                )}
              </>
            )}
          </div>
          {custoCoberturas > 0 && (
            <div className="px-4 py-1.5 grid grid-cols-2 text-sm border-t">
              <span className="text-muted-foreground">Coberturas</span>
              <span className="text-right tabular-nums">{formatEur(custoCoberturas)}</span>
            </div>
          )}
          {custoExtras > 0 && (
            <div className="px-4 py-1.5 grid grid-cols-2 text-sm border-t">
              <span className="text-muted-foreground">Extras</span>
              <span className="text-right tabular-nums">{formatEur(custoExtras)}</span>
            </div>
          )}
          <div className="px-4 py-1.5 grid grid-cols-2 text-sm border-t">
            <span className="text-muted-foreground">Sub-total</span>
            <span className="text-right tabular-nums">{formatEur(subtotal)}</span>
          </div>
          <div className="px-4 py-1.5 grid grid-cols-2 text-sm border-t bg-muted/20">
            <span className="text-muted-foreground">IVA ({(taxaIVA * 100).toFixed(0)}%)</span>
            <span className="text-right tabular-nums">{formatEur(iva)}</span>
          </div>
          {custoTaxas > 0 && (
            <div className="px-4 py-1.5 grid grid-cols-2 text-sm border-t">
              <span className="text-muted-foreground">Taxas</span>
              <span className="text-right tabular-nums">{formatEur(custoTaxas)}</span>
            </div>
          )}
          <div className="px-4 py-2 grid grid-cols-2 text-sm border-t font-semibold">
            <span>Total</span>
            <span className="text-right tabular-nums">{formatEur(total)}</span>
          </div>
        </div>
      </Card>
    </aside>
  );
};
