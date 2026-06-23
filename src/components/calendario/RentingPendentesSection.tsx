import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { CalendarClock, Car, Loader2, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatMatricula } from './calendarioUtils';

import { useEventosPendentesRenting } from '@/hooks/useEventosPendentesRenting';
import { useGerarTokenRealizacao } from '@/hooks/useRealizacaoToken';

interface Props {
  tipo: 'entrega' | 'recolha';
}

/** Items de pendentes de renting injectados no mesmo divide-y dos
 *  drawers Check Out / Check In legacy. Mesma estética dos legacy
 *  com linhas extra para data de abertura + quem abriu. */
export const RentingPendentesSection: React.FC<Props> = ({ tipo }) => {
  const navigate = useNavigate();
  const { data: pendentes = [], isLoading } = useEventosPendentesRenting({ tipo });
  const gerarToken = useGerarTokenRealizacao();

  // Cores alinhadas com os drawers legacy: entrega=verde, recolha=laranja.
  const cor =
    tipo === 'entrega'
      ? {
          iconBg: 'bg-green-500/10',
          icon: 'text-green-600',
          btn: 'border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400',
        }
      : {
          iconBg: 'bg-orange-500/10',
          icon: 'text-orange-600',
          btn: 'border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400',
        };

  const handleAbrir = (eventoId: string) => {
    gerarToken.mutate(eventoId, {
      onSuccess: (token) => navigate(`/realizar/${token}`),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />A carregar pendentes...
      </div>
    );
  }

  if (pendentes.length === 0) return null;

  return (
    <>
      {pendentes.map((ev) => {
        const matricula = ev.titulo ? formatMatricula(ev.titulo) : '—';
        const isAbrindo = gerarToken.isPending && gerarToken.variables === ev.id;
        const abertoEmFmt = ev.aberto_em
          ? format(new Date(ev.aberto_em), 'dd/MM/yyyy HH:mm', { locale: pt })
          : null;
        return (
          <div
            key={ev.id}
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
          >
            <div className={`rounded-lg p-2 shrink-0 ${cor.iconBg}`}>
              <Car className={`h-4 w-4 ${cor.icon}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-mono font-semibold text-sm">{matricula}</p>
              <p className="text-xs text-muted-foreground truncate">
                {ev.contrato_codigo ? `Contrato #${ev.contrato_codigo}` : ''}
                {ev.cidade ? ` · ${ev.cidade}` : ''}
              </p>
              {(abertoEmFmt || ev.aberto_por) && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/80 mt-0.5">
                  {abertoEmFmt && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      Aberto {abertoEmFmt}
                    </span>
                  )}
                  {ev.aberto_por && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Por {ev.aberto_por}
                    </span>
                  )}
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className={`shrink-0 text-xs ${cor.btn}`}
              onClick={() => handleAbrir(ev.id)}
              disabled={gerarToken.isPending}
            >
              {isAbrindo ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : tipo === 'entrega' ? (
                'Check-out'
              ) : (
                'Check-in'
              )}
            </Button>
          </div>
        );
      })}
    </>
  );
};
