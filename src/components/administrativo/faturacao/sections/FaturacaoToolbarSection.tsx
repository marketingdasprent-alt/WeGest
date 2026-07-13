import { Building2, CreditCard, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { pt } from 'date-fns/locale';
import { METODO_OPTIONS } from '../faturacao';

interface FaturacaoToolbarSectionProps {
  // Estação
  estacoes: { id: string; nome: string }[];
  estacaoId: string;
  onEstacaoChange: (v: string) => void;
  // Método
  metodo: string;
  onMetodoChange: (v: string) => void;
  // Semana
  weekStart: Date;
  weekEnd: Date;
  selectedWeek: Date;
  isCurrentWeek: boolean;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onWeekDayClick: (day: Date | undefined) => void;
  onWeekShortcut: (d: Date) => void;
  getWeekLabel: () => string;
  weekShortcuts: { label: string; date: Date }[];
  weekStartsOn: number;
  // Filtros
  hasFilters: boolean;
  onLimparFiltros: () => void;
  totalCount: number;
  // Constantes
  TODAS: string;
  TODOS: string;
}

export function FaturacaoToolbarSection({
  estacoes, estacaoId, onEstacaoChange,
  metodo, onMetodoChange,
  weekStart, weekEnd, selectedWeek, isCurrentWeek,
  onPreviousWeek, onNextWeek, onWeekDayClick, onWeekShortcut,
  getWeekLabel, weekShortcuts, weekStartsOn,
  hasFilters, onLimparFiltros, totalCount,
  TODAS, TODOS,
}: FaturacaoToolbarSectionProps) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={estacaoId} onValueChange={onEstacaoChange}>
          <SelectTrigger className="h-9 min-w-[160px]">
            <SelectValue placeholder="Todas as estações" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as estações</SelectItem>
            {estacoes.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={metodo} onValueChange={onMetodoChange}>
          <SelectTrigger className="h-9 min-w-[160px]">
            <SelectValue placeholder="Todos os métodos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os métodos</SelectItem>
            {METODO_OPTIONS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={onPreviousWeek}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 min-w-[210px] justify-center">
              <CalendarIcon className="h-4 w-4" />
              {getWeekLabel()}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
            <div className="p-3 border-b">
              <div className="flex flex-wrap gap-1.5">
                {weekShortcuts.map((s) => (
                  <Button key={s.label} variant="outline" size="sm" className="text-xs h-7"
                    onClick={() => onWeekShortcut(s.date)}>{s.label}</Button>
                ))}
              </div>
            </div>
            <Calendar initialFocus mode="single" defaultMonth={selectedWeek}
              selected={selectedWeek} onSelect={onWeekDayClick}
              numberOfMonths={2} locale={pt} weekStartsOn={weekStartsOn}
              className="pointer-events-auto"
              modifiers={{ selected: { from: weekStart, to: weekEnd } }}
              modifiersStyles={{ selected: { backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 0 } }}
            />
            <div className="p-2 text-center text-xs text-muted-foreground border-t bg-muted/50">
              Clique num dia para selecionar a semana inteira (Seg-Dom)
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={onNextWeek} disabled={isCurrentWeek}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={onLimparFiltros}>
          <X className="h-4 w-4" /> Limpar Filtros
        </Button>
      )}

      <div className="ml-auto">
        <span className="text-sm text-muted-foreground">
          {totalCount} {totalCount === 1 ? 'registo' : 'registos'}
        </span>
      </div>
    </>
  );
}
