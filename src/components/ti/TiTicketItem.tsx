import { formatDistanceToNowStrict } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { aguardaSuporte, ultimaActividade } from '@/lib/tiTicketChat';
import type { TiTicket } from '@/hooks/useTiTickets';
import { TiEstadoEtiqueta } from './TiEstadoEtiqueta';

interface TiTicketItemProps {
  ticket: TiTicket;
  activo: boolean;
  mostrarEmpresa: boolean;
  /** Quem gere vê o ponto de "a vez é tua"; quem pediu não. */
  destacarPorResponder: boolean;
  onSelecionar: (id: string) => void;
}

export function TiTicketItem({
  ticket: t,
  activo,
  mostrarEmpresa,
  destacarPorResponder,
  onSelecionar,
}: TiTicketItemProps) {
  const actividade = ultimaActividade(t);
  const porResponder = destacarPorResponder && aguardaSuporte(t);

  return (
    <button
      type="button"
      onClick={() => onSelecionar(t.id)}
      aria-current={activo || undefined}
      className={cn(
        'group relative flex w-full flex-col gap-1.5 border-b border-border/60 px-4 py-3 text-left transition-colors',
        activo ? 'bg-primary/10' : 'hover:bg-muted/50'
      )}
    >
      {activo && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
      <div className="flex items-center gap-2">
        {porResponder && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Por responder" />
        )}
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          #{t.numero}
        </span>
        <span className={cn('truncate text-sm', porResponder ? 'font-semibold' : 'font-medium')}>
          {t.autor_nome}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {formatDistanceToNowStrict(new Date(actividade.em), { locale: pt, addSuffix: false })}
        </span>
      </div>
      <p
        className={cn(
          'line-clamp-2 text-xs',
          porResponder ? 'text-foreground/90' : 'text-muted-foreground'
        )}
      >
        {actividade.texto}
      </p>
      <div className="flex items-center gap-2">
        <TiEstadoEtiqueta status={t.status} />
        {mostrarEmpresa && t.organizacao?.nome && (
          <span className="truncate text-[11px] text-muted-foreground">{t.organizacao.nome}</span>
        )}
        {t.anexos.length > 0 && (
          <span className="ml-auto flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            {t.anexos.length}
          </span>
        )}
      </div>
    </button>
  );
}
