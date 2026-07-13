import type { UseFormReturn } from 'react-hook-form';
import { AlertTriangle, CarTaxiFront, Coins, Euro } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { SectionHeader } from '../../../SectionHeader';

import type { ReservaFormValues } from '../../reservaDialog.schema';
import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { RentingTarifaMin, FaturacaoRenting } from '@/hooks/useRentingGruposTarifas';

interface TarifaSectionProps {
  form: UseFormReturn<ReservaFormValues>;
  isSlot: boolean;
  isTvde: boolean;
  tarifasDoRegime: RentingTarifaMin[];
  tarifaAtual: RentingTarifaMin | null;
  modeloIdSel: string | null;
  viaturaSelected: ViaturaBasic | null;
  modeloSemPreco: boolean;
  faturacao: FaturacaoRenting | null;
  precoModeloSemanaTvde: number | null;
  precoModeloDiaRac: number | null;
  precoModeloMesRac: number | null;
}

export function ReservaTabGeralSectionTarifa({
  form,
  isSlot,
  isTvde,
  tarifasDoRegime,
  tarifaAtual,
  modeloIdSel,
  viaturaSelected,
  modeloSemPreco,
  faturacao,
  precoModeloSemanaTvde,
  precoModeloDiaRac,
  precoModeloMesRac,
}: TarifaSectionProps) {
  const regime = form.watch('regime');
  return (
    <>
      {/* === Tarifa & Faturação (da viatura escolhida) — não aplicável a slot === */}
      {!isSlot && (
        <div>
          <SectionHeader icon={Coins} title="Tarifa & Faturação" accent="emerald" />

          <div className="mb-3">
            <FormField
              control={form.control}
              name="tarifa_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isTvde ? 'Tarifa TVDE' : 'Tarifa Rent-a-Car'}{' '}
                    <span className="text-red-500">*</span>
                  </FormLabel>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v || null)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            isTvde ? 'Selecionar tarifa TVDE...' : 'Selecionar tarifa Rent-a-Car...'
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {tarifasDoRegime.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          {modeloIdSel
                            ? 'Nenhuma tarifa cobre o modelo desta viatura.'
                            : isTvde
                              ? 'Nenhuma tarifa TVDE. Cria uma em Renting → Tarifas.'
                              : 'Nenhuma tarifa Rent-a-Car. Cria uma em Renting → Tarifas.'}
                        </div>
                      )}
                      {tarifasDoRegime.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {modeloSemPreco && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Modelo sem preço nesta tarifa</AlertTitle>
                <AlertDescription>
                  A viatura escolhida ({viaturaSelected?.marca} {viaturaSelected?.modelo}) não tem
                  preço definido na tarifa selecionada. Define o preço deste modelo na tarifa ou
                  escolhe outra viatura/tarifa — não é possível guardar assim.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {tarifaAtual ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(isTvde
                ? [
                    { label: 'Tarifa', value: tarifaAtual.nome },
                    {
                      label: 'Modelo',
                      value: viaturaSelected
                        ? `${viaturaSelected.marca} ${viaturaSelected.modelo}`
                        : '—',
                    },
                    {
                      label: 'Preço / semana',
                      value:
                        precoModeloSemanaTvde != null ? `${precoModeloSemanaTvde} €` : 'Sem preço',
                    },
                    { label: 'Faturação', value: 'Semanal' },
                  ]
                : [
                    { label: 'Tarifa', value: tarifaAtual.nome },
                    {
                      label: 'Modelo',
                      value: viaturaSelected
                        ? `${viaturaSelected.marca} ${viaturaSelected.modelo}`
                        : '—',
                    },
                    {
                      label: 'Preço / dia',
                      value: precoModeloDiaRac != null ? `${precoModeloDiaRac} €` : 'Sem preço',
                    },
                    {
                      label: 'Preço / mês',
                      value: precoModeloMesRac != null ? `${precoModeloMesRac} €` : '—',
                    },
                  ]
              ).map((cell) => (
                <div key={cell.label} className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                    {cell.label}
                  </p>
                  <p className="mt-0.5 font-semibold truncate">{cell.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
              {isTvde
                ? 'Seleciona a tarifa TVDE e uma viatura para ver o preço semanal do modelo.'
                : 'Seleciona uma viatura e a tarifa Rent-a-Car para ver o preço do modelo.'}
            </div>
          )}

          {faturacao && (
            <div className="mt-3 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-brand-navy/10 p-4">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    <Euro className="h-3.5 w-3.5" />
                    Faturar ao cliente
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {faturacao.modo} · {faturacao.descricao}
                  </p>
                </div>
                <p className="shrink-0 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {faturacao.valor.toFixed(2)} €
                </p>
              </div>
              {regime === 'tvde' && (
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-emerald-500/20 pt-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CarTaxiFront className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Condutor · conta-corrente semanal
                  </p>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {faturacao.semanalCondutor != null
                      ? `${faturacao.semanalCondutor.toFixed(2)} €/sem`
                      : '— sem preço/semana'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
