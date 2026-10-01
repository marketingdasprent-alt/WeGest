import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { pt } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  atalhosPeriodo,
  deslocarPeriodo,
  periodoIncluiHoje,
  rotuloPeriodo,
  type PeriodoCartoes,
} from './cartoesFlotaPeriodo';

interface CartoesFlotaPeriodoSelectorProps {
  periodo: PeriodoCartoes;
  onPeriodoChange: (p: PeriodoCartoes) => void;
}

export function CartoesFlotaPeriodoSelector({
  periodo,
  onPeriodoChange,
}: CartoesFlotaPeriodoSelectorProps) {
  const isMobile = useIsMobile();
  const atalhos = atalhosPeriodo();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onPeriodoChange(deslocarPeriodo(periodo, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="justify-center text-center font-normal min-w-[220px]"
          >
            <Calendar className="mr-2 h-4 w-4" />
            {rotuloPeriodo(periodo)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
          <div className="p-3 border-b">
            <div className="flex flex-wrap gap-1.5">
              {atalhos.map((a) => (
                <Button
                  key={a.label}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => onPeriodoChange(a.periodo)}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
          <CalendarComponent
            initialFocus
            mode="range"
            defaultMonth={periodo.from}
            selected={{ from: periodo.from, to: periodo.to }}
            onSelect={(r) => {
              if (r?.from) onPeriodoChange({ from: r.from, to: r.to ?? r.from });
            }}
            numberOfMonths={isMobile ? 1 : 2}
            locale={pt}
            weekStartsOn={1}
            className="pointer-events-auto"
            classNames={{ day_today: 'border border-primary text-foreground' }}
            disabled={{ after: new Date() }}
          />
          <div className="p-2 text-center text-xs text-muted-foreground border-t bg-muted/50">
            Escolhe um atalho ou marca o intervalo no calendário
          </div>
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="icon"
        onClick={() => onPeriodoChange(deslocarPeriodo(periodo, 1))}
        disabled={periodoIncluiHoje(periodo)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
