// src/components/faturacao/acordo/ParcelaTimelineItem.tsx
import { CalendarClock, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ParcelaStatusBadge } from '@/components/faturacao/ParcelaStatusBadge';
import { formatCurrency } from '@/utils/formatters';
import type { ParcelaDetalhe } from '@/hooks/useAcordoDetalhe';

const dataPT = (iso: string) => iso.split('-').reverse().join('/');

const ABERTAS: ParcelaDetalhe['estado'][] = ['agendada', 'avisada', 'vencida'];

interface Props {
  parcela: ParcelaDetalhe;
  onRegistarPagamento: (parcela: ParcelaDetalhe) => void;
  onVerDocumento: (invoiceId: string) => void;
}

export function ParcelaTimelineItem({ parcela, onRegistarPagamento, onVerDocumento }: Props) {
  const aberta = ABERTAS.includes(parcela.estado);

  return (
    <li className="ml-6">
      <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 ring-4 ring-background">
        <CalendarClock className="h-3 w-3 text-primary" />
      </span>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">Parcela {parcela.numero}</span>
          <ParcelaStatusBadge estado={parcela.estado} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(parcela.valor)} · vence {dataPT(parcela.dataVencimento)}
          </span>
        </div>

        {parcela.estado === 'liquidacao_pendente' && !parcela.suspenso && (
          <p className="text-xs text-indigo-700 dark:text-indigo-300">
            ⏳ Pagamento registado — recibo por emitir. Nova tentativa automática em breve.
          </p>
        )}

        {parcela.suspenso && (
          <p className="text-xs text-destructive">
            ⚠ Recibo suspenso — precisa de verificação. A ligação ao software de faturação falhou e
            não é possível confirmar se o recibo chegou a ser emitido.
          </p>
        )}

        {parcela.avisoEnviadoEm && (
          <p className="text-xs text-muted-foreground">
            Aviso enviado {dataPT(parcela.avisoEnviadoEm.slice(0, 10))}
          </p>
        )}

        <div className="flex items-center gap-2">
          {aberta && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => onRegistarPagamento(parcela)}
            >
              Registar pagamento
            </Button>
          )}
          {parcela.invoiceRcId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => onVerDocumento(parcela.invoiceRcId!)}
            >
              <Eye className="h-3.5 w-3.5" />
              Ver recibo
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
