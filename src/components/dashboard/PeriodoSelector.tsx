// Botão + popover de escolha do período de um gráfico: quatro presets e um
// intervalo à medida. Partilhado pelas dashboards de início — o mesmo controlo
// no mesmo sítio, para "Este Mês" querer dizer o mesmo em qualquer uma delas.
import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { endOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  PRESET_LABELS,
  getPeriodRange,
  labelDoPeriodo,
  type DateRange,
  type FixedPreset,
  type PeriodPreset,
} from '@/components/dashboard/periodo';

interface PeriodoSelectorProps {
  preset: PeriodPreset;
  range: DateRange;
  onChange: (preset: PeriodPreset, range: DateRange) => void;
}

export function PeriodoSelector({ preset, range, onChange }: PeriodoSelectorProps) {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<DayPickerRange | undefined>();

  const escolherPreset = (p: FixedPreset) => {
    onChange(p, getPeriodRange(p));
    setAberto(false);
  };

  // Só aplica com as duas datas escolhidas — um clique único no Calendar em
  // modo "range" define apenas `from`.
  const escolherIntervalo = (escolhido: DayPickerRange | undefined) => {
    setRascunho(escolhido);
    if (escolhido?.from && escolhido?.to) {
      // `to` vem às 00:00 do dia escolhido; sem endOfDay perdia-se esse último
      // dia, que as queries contam até ao fim.
      onChange('personalizado', { from: escolhido.from, to: endOfDay(escolhido.to) });
      setAberto(false);
    }
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CalendarRange className="h-3.5 w-3.5" />
          {labelDoPeriodo(preset, range)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex flex-col gap-0.5 p-2">
          {(Object.keys(PRESET_LABELS) as FixedPreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => escolherPreset(p)}
              className={cn(
                'rounded-md px-3 py-1.5 text-left text-sm transition-colors duration-150',
                preset === p ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-muted'
              )}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="border-t border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Intervalo personalizado
        </div>
        <Calendar
          mode="range"
          selected={rascunho}
          onSelect={escolherIntervalo}
          numberOfMonths={2}
          defaultMonth={range.from}
        />
      </PopoverContent>
    </Popover>
  );
}
