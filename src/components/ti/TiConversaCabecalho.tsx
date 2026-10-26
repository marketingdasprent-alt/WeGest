import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EstadoTicket } from '@/lib/tiTicketEstados';
import { TiEstadoEtiqueta } from './TiEstadoEtiqueta';

interface TiConversaCabecalhoProps {
  numero: number;
  autorNome: string;
  autorEmail?: string;
  empresa?: string | null;
  criadoEm: string;
  status: EstadoTicket;
  acoes?: ReactNode;
  /** Só em ecrã pequeno, onde a lista e a conversa não cabem lado a lado. */
  onVoltar?: () => void;
}

export function TiConversaCabecalho({
  numero,
  autorNome,
  autorEmail,
  empresa,
  criadoEm,
  status,
  acoes,
  onVoltar,
}: TiConversaCabecalhoProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
      {onVoltar && (
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 lg:hidden"
          aria-label="Voltar à lista"
          onClick={onVoltar}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Pedido #{numero}</h2>
          <TiEstadoEtiqueta status={status} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {autorNome}
          {autorEmail && ` · ${autorEmail}`}
          {empresa && ` · ${empresa}`}
          {` · ${format(new Date(criadoEm), 'dd/MM/yyyy HH:mm')}`}
        </p>
      </div>
      {acoes}
    </div>
  );
}
