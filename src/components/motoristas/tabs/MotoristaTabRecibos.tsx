import { useState } from 'react';
import { MotoristaRecibosSection } from './MotoristaRecibosSection';
import type { Motorista } from '@/pages/Motoristas';
import { subWeeks, addWeeks, startOfWeek, endOfWeek, format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface MotoristaTabRecibosProps {
  motorista: Motorista;
}

export function MotoristaTabRecibos({ motorista }: MotoristaTabRecibosProps) {
  const [selectedWeek, setSelectedWeek] = useState<Date>(subWeeks(new Date(), 0));

  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });

  const handlePrevWeek = () => setSelectedWeek(subWeeks(selectedWeek, 1));
  const handleNextWeek = () => setSelectedWeek(addWeeks(selectedWeek, 1));
  const handleThisWeek = () => setSelectedWeek(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/30 p-4 rounded-xl border border-dashed">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Resumos Semanais
          </h2>
          <p className="text-sm text-muted-foreground">
            Resumos financeiros e recibos verdes do motorista.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-background p-1 rounded-lg border shadow-sm">
          <Button variant="ghost" size="icon" onClick={handlePrevWeek} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="px-3 py-1 text-sm font-medium min-w-[200px] text-center">
            {format(weekStart, 'dd MMM', { locale: pt })} -{' '}
            {format(weekEnd, 'dd MMM', { locale: pt })}
          </div>

          <Button variant="ghost" size="icon" onClick={handleNextWeek} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="h-4 w-[1px] bg-border mx-1" />

          <Button variant="ghost" size="sm" onClick={handleThisWeek} className="h-8 text-xs px-2">
            Esta Semana
          </Button>
        </div>
      </div>

      <MotoristaRecibosSection
        motoristaId={motorista.id}
        selectedWeek={selectedWeek}
        motorista={motorista}
      />
    </div>
  );
}
