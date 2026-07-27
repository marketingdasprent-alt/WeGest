import { useEffect, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { MapPin } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { SectionHeader } from '../../../SectionHeader';
import { ALDFields } from '@/components/renting/shared/ALDFields';

import type { ReservaFormValues } from '../../../reservaDialog.schema';
import type { Estacao } from '@/hooks/useEstacoes';

import { addDaysToLocalInput, diferencaDias } from '@/utils/reserva-formatters';

const SENTINEL_NONE = '__none__';

interface PeriodosSectionProps {
  form: UseFormReturn<ReservaFormValues>;
  estacoes: Estacao[];
  isSlot: boolean;
  isTvde: boolean;
  modoMensal: boolean;
  renovacaoOpcao: string | undefined;
  renovacaoIntervalo: number | undefined;
}

export function ReservaTabGeralSectionPeriodos({
  form,
  estacoes,
  isSlot,
  isTvde,
  modoMensal,
  renovacaoOpcao,
  renovacaoIntervalo,
}: PeriodosSectionProps) {
  const dataInicio = form.watch('data_inicio');
  const dataFim = form.watch('data_fim');
  const dias = diferencaDias(dataInicio ?? '', dataFim ?? '');
  const [diasInput, setDiasInput] = useState<string>(dias !== null ? String(dias) : '');

  useEffect(() => {
    setDiasInput(dias !== null ? String(dias) : '');
  }, [dias]);

  const handleDiasManualChange = (raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    setDiasInput(cleaned);
    if (cleaned === '') return;
    const n = parseInt(cleaned, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    if (!dataInicio) return;
    const novoFim = addDaysToLocalInput(dataInicio, n);
    if (novoFim) form.setValue('data_fim', novoFim, { shouldValidate: true });
  };

  const handleIntervaloChange = (raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    if (cleaned === '') return;
    const n = parseInt(cleaned, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    form.setValue('renovacao_intervalo_dias', n, { shouldDirty: true });
  };

  return (
    <>
      {/* === Slot: data de início === */}
      {isSlot && (
        <div className="space-y-4">
          <SectionHeader
            icon={MapPin}
            title="Início do Slot"
            accent="amber"
            required
            hint="Quando o motorista começa a usar o slot"
          />
          <FormField
            control={form.control}
            name="data_inicio"
            render={({ field }) => (
              <FormItem className="max-w-xs">
                <FormLabel>
                  Data Início <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="datetime-local"
                    className="bg-background"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* === Entrega | Recolha (não aplicável a slot) === */}
      {!isSlot && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Entrega */}
          <div className="space-y-4">
            <SectionHeader icon={MapPin} title="Entrega" accent="sky" />
            <FormField
              control={form.control}
              name="estacao_entrega_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Estação Início <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select
                    value={field.value ?? SENTINEL_NONE}
                    onValueChange={(v) => {
                      if (!v) return;
                      field.onChange(v === SENTINEL_NONE ? null : v);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Selecciona estação..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={SENTINEL_NONE}>— Sem estação —</SelectItem>
                      {estacoes.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="data_inicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Data Início <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      className="bg-background"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Recolha */}
          <div className="space-y-4">
            <SectionHeader
              icon={MapPin}
              title="Recolha"
              accent="violet"
              right={
                <div className="flex h-8 items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {modoMensal && renovacaoOpcao === 'intervalo_dias'
                      ? 'Intervalo (dias)'
                      : 'Nº Dias'}
                  </span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={
                      modoMensal && renovacaoOpcao === 'intervalo_dias'
                        ? (renovacaoIntervalo ?? 30).toString()
                        : diasInput
                    }
                    onChange={(e) =>
                      modoMensal && renovacaoOpcao === 'intervalo_dias'
                        ? handleIntervaloChange(e.target.value)
                        : handleDiasManualChange(e.target.value)
                    }
                    disabled={!dataInicio || (modoMensal && renovacaoOpcao !== 'intervalo_dias')}
                    className="h-8 w-16 text-center bg-background text-base font-semibold disabled:bg-muted"
                    placeholder="—"
                    title={
                      modoMensal && renovacaoOpcao !== 'intervalo_dias'
                        ? 'Calculado automaticamente pela opção de renovação'
                        : modoMensal
                          ? 'Intervalo de renovação — altera a Data Fim automaticamente'
                          : dataInicio
                            ? 'Editar ajusta a Data Fim automaticamente'
                            : 'Define primeiro a Data Início'
                    }
                  />
                </div>
              }
            />
            {isTvde ? (
              <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
                Reservas TVDE não definem estação de recolha fixa — a viatura pode ser recolhida em
                qualquer estação no fim do contrato.
              </div>
            ) : (
              <FormField
                control={form.control}
                name="estacao_recolha_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Estação Fim <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      value={field.value ?? SENTINEL_NONE}
                      onValueChange={(v) => {
                        if (!v) return;
                        field.onChange(v === SENTINEL_NONE ? null : v);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Selecciona estação..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={SENTINEL_NONE}>— Sem estação —</SelectItem>
                        {estacoes.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {isTvde ? (
              <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
                Reservas TVDE não têm data de fim — o contrato nasce em aberto e a 1.ª renovação
                («Renovar contrato») fecha o período até esse dia e arranca o ciclo mensal.
              </div>
            ) : (
              <FormField
                control={form.control}
                name="data_fim"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Data Fim <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        className={modoMensal ? 'bg-muted' : 'bg-background'}
                        disabled={modoMensal}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        </div>
      )}

      {/* === Aluguer Longa Duração + Renovação (shared) === */}
      <ALDFields idPrefix="reserva" />
    </>
  );
}
