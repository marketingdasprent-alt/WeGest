import React, { useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EventoCard, formatMatricula } from './EventoCard';
import type { CalendarioEvento } from '@/pages/Calendario';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from 'date-fns';
import { pt } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  eventos: CalendarioEvento[];
  currentMonth: Date;
  onMonthChange: (d: Date) => void;
  onEventClick: (e: CalendarioEvento) => void;
  onDeleteEvent: (id: string) => void;
  onEventDetails: (e: CalendarioEvento) => void;
  onDaySelect?: (d: Date) => void;
  isLoading: boolean;
  currentUserId?: string;
  canEditAll?: boolean;
}

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export const CalendarioGrid: React.FC<Props> = ({
  eventos,
  currentMonth,
  onMonthChange,
  onEventClick,
  onDeleteEvent,
  onEventDetails,
  onDaySelect,
  isLoading,
  currentUserId,
  canEditAll,
}) => {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [panelWidth, setPanelWidth] = useState(280);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      isResizing.current = true;
      startX.current = e.clientX;
      startWidth.current = panelWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        const delta = startX.current - ev.clientX;
        const next = Math.min(520, Math.max(200, startWidth.current + delta));
        setPanelWidth(next);
      };
      const onMouseUp = () => {
        isResizing.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [panelWidth]
  );

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let day = calStart;
  while (day <= calEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  // Eventos slot aparecem só no Relatório de Eventos, não no grid do calendário.
  const getEventsForDay = (d: Date) =>
    eventos.filter((ev) => ev.tipo !== 'slot' && isSameDay(new Date(ev.data_inicio), d));

  const today = new Date();

  const dayEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  if (isLoading) {
    return (
      <div className="flex flex-col h-full gap-2">
        <Skeleton className="h-8 w-full shrink-0" />
        <div className="grid grid-cols-7 grid-rows-6 gap-1 flex-1 min-h-0">
          {Array.from({ length: 42 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-full" />
          ))}
        </div>
      </div>
    );
  }

  const weeksCount = Math.max(1, Math.ceil(days.length / 7));

  const calendarPane = (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      {/* Month nav */}
      <div className="flex items-center justify-between shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onMonthChange(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-base font-semibold capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: pt })}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onMonthChange(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 shrink-0 mt-1">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="text-center text-[11px] font-medium text-muted-foreground py-0.5"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Days grid (fills remaining height) */}
      <div
        className="grid grid-cols-7 gap-1 flex-1 min-h-0 mt-1"
        style={{ gridTemplateRows: `repeat(${weeksCount}, minmax(0, 1fr))` }}
      >
        {days.map((d, i) => {
          const dayEvts = getEventsForDay(d);
          const isCurrentMonth = isSameMonth(d, currentMonth);
          const isToday = isSameDay(d, today);
          const isSelected = selectedDay && isSameDay(d, selectedDay);

          const visibleEvts = dayEvts.slice(0, 3);
          const extraCount = dayEvts.length - visibleEvts.length;

          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => {
                const wasSelected = selectedDay && isSameDay(d, selectedDay);
                if (wasSelected) {
                  setSelectedDay(null);
                } else {
                  setSelectedDay(d);
                  onDaySelect?.(d);
                }
              }}
              className={cn(
                'relative h-full min-h-0 p-1.5 rounded-md border transition-colors text-left flex flex-col cursor-pointer touch-manipulation overflow-hidden',
                !isCurrentMonth && 'opacity-40',
                isToday && 'border-primary bg-primary/5',
                isSelected && 'ring-2 ring-primary',
                !isToday && !isSelected && 'border-border hover:bg-muted/50'
              )}
            >
              <span
                className={cn('text-xs font-medium shrink-0', isToday && 'text-primary font-bold')}
              >
                {format(d, 'd')}
              </span>
              {dayEvts.length > 0 && (
                <div className="mt-0.5 space-y-0.5 flex-1 overflow-hidden min-h-0">
                  {visibleEvts.map((ev) => (
                    <div
                      key={ev.id}
                      className={cn(
                        'text-[10px] leading-tight px-1 py-0.5 rounded truncate',
                        ev.tipo === 'entrega' &&
                          'bg-green-500/20 text-green-700 dark:text-green-300',
                        ev.tipo === 'recolha' && 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
                        ev.tipo === 'devolucao' &&
                          'bg-orange-500/20 text-orange-700 dark:text-orange-300',
                        ev.tipo === 'troca' &&
                          'bg-purple-500/20 text-purple-700 dark:text-purple-300',
                        ev.tipo === 'upgrade' &&
                          'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
                        ev.tipo === 'lista_espera' &&
                          'bg-pink-500/20 text-pink-700 dark:text-pink-300',
                        ev.tipo === 'transferencia' &&
                          'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300'
                      )}
                    >
                      {ev.tipo === 'lista_espera' ? ev.titulo : formatMatricula(ev.titulo)}
                      {ev.cidade ? ` ${ev.cidade.toUpperCase()}` : ''}
                    </div>
                  ))}
                  {extraCount > 0 && (
                    <span className="text-[9px] text-muted-foreground font-medium">
                      +{extraCount}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const sidePanel = selectedDay && (
    <>
      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        className="hidden lg:flex items-center justify-center w-2 shrink-0 cursor-col-resize group self-stretch"
        title="Arrastar para redimensionar"
      >
        <div className="w-0.5 h-10 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
      </div>

      <aside
        className="hidden lg:flex flex-col h-full min-h-0 shrink-0 rounded-lg border border-border bg-card/40"
        style={{ width: panelWidth }}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 shrink-0">
          <h3 className="text-xs font-semibold capitalize">
            {format(selectedDay, "d 'de' MMM", { locale: pt })}
          </h3>
          <div className="flex items-center gap-1">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 hidden lg:block" />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setSelectedDay(null)}
              aria-label="Fechar painel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 [&_.text-sm]:text-xs [&_.text-xs]:text-[10px] [&_.p-3]:p-2 [&_.h-3]:h-2.5 [&_.w-3]:w-2.5 [&_.h-4]:h-3 [&_.w-4]:w-3">
          {dayEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem eventos neste dia.</p>
          ) : (
            dayEvents.map((ev) => (
              <EventoCard
                key={ev.id}
                evento={ev}
                onEdit={onEventClick}
                onDelete={onDeleteEvent}
                onDetails={onEventDetails}
                canEdit={canEditAll || currentUserId === ev.criado_por}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex-1 min-w-0 min-h-0">{calendarPane}</div>
      {sidePanel}
    </div>
  );
};
