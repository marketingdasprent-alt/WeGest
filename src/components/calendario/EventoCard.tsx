import React from 'react';
import { CheckCircle2, Pencil, Trash2, Clock, User, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { CalendarioEvento } from '@/pages/Calendario';

interface Props {
  evento: CalendarioEvento;
  onEdit: (e: CalendarioEvento) => void;
  onDelete: (id: string) => void;
  onDetails: (e: CalendarioEvento) => void;
  canEdit: boolean;
}

const TIPO_LABELS: Record<string, string> = {
  entrega: 'Entrega',
  recolha: 'Recolha',
  devolucao: 'Devolução',
  troca: 'Troca',
  upgrade: 'Upgrade',
  lista_espera: 'Lista de Espera',
  transferencia: 'Transferência',
  slot: 'Slot',
};

const TIPO_COLORS: Record<string, string> = {
  entrega: 'border-l-green-500',
  recolha: 'border-l-blue-500',
  devolucao: 'border-l-orange-500',
  troca: 'border-l-purple-500',
  upgrade: 'border-l-yellow-500',
  lista_espera: 'border-l-pink-500',
  transferencia: 'border-l-cyan-500',
  slot: 'border-l-amber-500',
};

export function formatMatricula(val: string): string {
  const clean = val.replace(/[-\s]/g, '').toUpperCase();
  return clean.match(/.{1,2}/g)?.join('-') || clean;
}

export const EventoCard: React.FC<Props> = ({ evento, onEdit, onDelete, onDetails, canEdit }) => {
  return (
    <div
      className={cn(
        'border border-l-4 rounded-lg p-3 bg-card cursor-pointer hover:bg-muted/50 transition-colors',
        TIPO_COLORS[evento.tipo] || TIPO_COLORS.entrega
      )}
      onClick={() => onDetails(evento)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">
              {evento.tipo === 'lista_espera' || evento.tipo === 'slot' ? (
                evento.titulo
              ) : evento.tipo === 'troca' ? (
                <>
                  {formatMatricula(evento.titulo)}
                  {evento.matricula_devolver && ` ↔ ${formatMatricula(evento.matricula_devolver)}`}
                </>
              ) : (
                formatMatricula(evento.titulo)
              )}
              {evento.cidade && ` ${evento.cidade.toUpperCase()}`}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {TIPO_LABELS[evento.tipo] || evento.tipo}
            </span>
            {evento.realizado_em && (
              <span
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                title={`Realizado por ${evento.realizador?.nome ?? '—'}`}
              >
                <CheckCircle2 className="h-3 w-3" />
                Realizado
              </span>
            )}
          </div>
          {!evento.dia_todo && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{format(new Date(evento.data_inicio), 'HH:mm')}</span>
              {evento.data_fim && <span>- {format(new Date(evento.data_fim), 'HH:mm')}</span>}
            </div>
          )}
          {evento.descricao && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <MessageSquareText className="h-3 w-3" />
              <span className="truncate">{evento.descricao}</span>
            </div>
          )}
          {evento.profiles?.nome && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span>{evento.profiles.nome}</span>
            </div>
          )}
          {evento.realizador?.nome && evento.realizado_em && (
            <div className="flex items-center gap-1 mt-1 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              <span>
                Por {evento.realizador.nome}{' '}
                {format(new Date(evento.realizado_em), "dd/MM 'às' HH:mm")}
              </span>
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(evento);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(evento.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
