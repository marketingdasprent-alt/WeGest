import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ArrowRight, CalendarPlus, FileText, History, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { Reserva } from '@/types/reserva';

interface ReservaTabHistoricoProps {
  reserva: Reserva | null;
  contratoExistente?: { id: string; codigo?: number | null } | null;
  onAbrirContrato?: () => void;
}

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: pt });
};

/**
 * Sub-tab Histórico da reserva. A reserva (ao contrário do contrato) não é
 * versionada — as alterações gravam-se directamente. Mostra por isso só os
 * marcos reais do ciclo de vida em vez de simular um histórico de versões.
 */
export const ReservaTabHistorico: React.FC<ReservaTabHistoricoProps> = ({
  reserva,
  contratoExistente,
  onAbrirContrato,
}) => {
  if (!reserva) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Guarde a reserva primeiro para ver o histórico.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 pb-2 border-b mb-4">
        <History className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold">Histórico</h3>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        A reserva não é versionada — as alterações gravam-se directamente. O histórico de versões só
        começa a existir a partir do contrato.
      </p>

      <ul className="space-y-2">
        <li className="border rounded-md p-3 border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-semibold text-sm">Reserva criada</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{fmtData(reserva.created_at)}</p>
        </li>

        {reserva.updated_at && reserva.updated_at !== reserva.created_at && (
          <li className="border rounded-md p-3 border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-semibold text-sm">Última alteração</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{fmtData(reserva.updated_at)}</p>
          </li>
        )}

        {contratoExistente && (
          <li className="border rounded-md p-3 border-primary/40 bg-primary/5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-sm">
                  Contrato{contratoExistente.codigo ? ` #${contratoExistente.codigo}` : ''} gerado
                </span>
              </div>
              {onAbrirContrato && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onAbrirContrato}
                  className="gap-1 shrink-0"
                >
                  Abrir
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </li>
        )}
      </ul>
    </div>
  );
};
