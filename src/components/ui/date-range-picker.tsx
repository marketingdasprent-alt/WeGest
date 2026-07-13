import * as React from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DateRange, DatePreset } from '@/types/dateRange';
import { PRESET_OPTIONS } from '@/types/dateRange';

/**
 * Props do DateRangePicker.
 * Usado em conjunto com `useDateRange()` para sincronizar estado.
 */
export interface DateRangePickerProps {
  dateRange: DateRange;
  preset: DatePreset;
  isCustom: boolean;
  onPresetChange: (preset: DatePreset) => void;
  onCustomRangeChange: (range: DateRange) => void;
  className?: string;
}

/**
 * Componente de selecção de intervalo de datas com presets + calendário.
 *
 * Layout:
 * - Popover trigger → mostra intervalo actual ou "Selecionar datas"
 * - Popover content → presets como chips + separador + calendário de range
 *
 * @example
 * ```tsx
 * const { dateRange, preset, setPreset, setCustomRange, isCustom } = useDateRange();
 * <DateRangePicker
 *   dateRange={dateRange}
 *   preset={preset}
 *   isCustom={isCustom}
 *   onPresetChange={setPreset}
 *   onCustomRangeChange={setCustomRange}
 * />
 * ```
 */
export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  dateRange,
  preset,
  isCustom,
  onPresetChange,
  onCustomRangeChange,
  className,
}) => {
  const [open, setOpen] = React.useState(false);

  const displayText = React.useMemo(() => {
    if (!dateRange.from) return 'Selecionar datas';
    if (!dateRange.to) return format(dateRange.from, 'dd/MM/yyyy');
    return `${format(dateRange.from, 'dd/MM/yyyy')} – ${format(dateRange.to, 'dd/MM/yyyy')}`;
  }, [dateRange]);

  const handlePresetClick = (value: DatePreset) => {
    onPresetChange(value);
    setOpen(false);
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      onCustomRangeChange(range);
      setOpen(false);
    } else if (range) {
      onCustomRangeChange(range);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-[280px] justify-start text-left font-normal',
            !dateRange.from && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Presets (lado esquerdo) */}
          <div className="flex flex-col gap-1 p-3 border-r">
            <p className="text-xs font-medium text-muted-foreground mb-1">Períodos</p>
            {PRESET_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={preset === opt.value ? 'secondary' : 'ghost'}
                size="sm"
                className="justify-start"
                onClick={() => handlePresetClick(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {/* Calendário (lado direito) */}
          <div className="p-3">
            <Calendar
              mode="range"
              selected={dateRange.from ? { from: dateRange.from, to: dateRange.to } : undefined}
              onSelect={handleRangeSelect}
              numberOfMonths={2}
              defaultMonth={dateRange.from ?? new Date()}
              disabled={{ after: new Date() }}
              initialFocus
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
