import React from 'react';
import { ArrowLeft, Clock, UserPlus, Users, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { statusConfig, prioridadeConfig } from '@/lib/ticketsConfig';
import type { Ticket, Categoria } from './types';

interface Acesso {
  id: string;
  nome: string | null;
}

interface Props {
  ticket: Ticket;
  categoria: Categoria | null;
  acessos: Acesso[];
  canChangeStatus: boolean;
  canManageAccess: boolean;
  onBack: () => void;
  onOpenAccesses: () => void;
  onAddAccess: () => void;
  onOpenEditMode: () => void;
  onStatusChange: (status: string) => void;
}

export const TicketHeader: React.FC<Props> = ({
  ticket,
  categoria,
  acessos,
  canChangeStatus,
  canManageAccess,
  onBack,
  onOpenAccesses,
  onAddAccess,
  onOpenEditMode,
  onStatusChange,
}) => (
  <>
    <div className="flex flex-col gap-2 shrink-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1 flex-wrap">
            <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
              #{String(ticket.numero).padStart(4, '0')}
            </span>
            {categoria && (
              <Badge
                variant="outline"
                className="shrink-0"
                style={{ borderColor: categoria.cor, color: categoria.cor }}
              >
                {categoria.nome}
              </Badge>
            )}
            <Badge className={`shrink-0 ${prioridadeConfig[ticket.prioridade]?.color}`}>
              {prioridadeConfig[ticket.prioridade]?.label}
            </Badge>
          </div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold truncate">{ticket.titulo}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 pl-11 sm:pl-0">
        <div className="hidden sm:flex -space-x-2 overflow-hidden">
          {acessos.slice(0, 3).map((u) => (
            <div
              key={u.id}
              className="inline-block h-8 w-8 rounded-full border-2 border-background bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary"
              title={u.nome || ''}
            >
              {u.nome?.substring(0, 2).toUpperCase()}
            </div>
          ))}
          {acessos.length > 3 && (
            <div className="inline-block h-8 w-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
              +{acessos.length - 3}
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs gap-1"
          onClick={onOpenAccesses}
        >
          <Users className="h-3.5 w-3.5" />
          <span className="hidden xs:inline">Acessos</span>
        </Button>
        {canManageAccess && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-primary shadow-sm hover:bg-primary/5"
            onClick={onAddAccess}
          >
            <UserPlus className="h-3.5 w-3.5" />
          </Button>
        )}
        {canChangeStatus && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs gap-1 border-primary/20 text-primary hover:bg-primary/5 shadow-sm"
            onClick={onOpenEditMode}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">Editar</span>
          </Button>
        )}
        <Select
          value={ticket.status}
          onValueChange={onStatusChange}
          disabled={
            !canChangeStatus || ['resolvido', 'fechado', 'pendente'].includes(ticket.status)
          }
        >
          <SelectTrigger
            className={`w-[120px] sm:w-[140px] md:w-[160px] font-bold text-white transition-all shrink-0 ${statusConfig[ticket.status]?.color}`}
          >
            <div className="flex items-center gap-1.5">
              {statusConfig[ticket.status]?.icon}
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            {ticket.status === 'pendente' && <SelectItem value="pendente">Pendente</SelectItem>}
            <SelectItem value="aberto">Aberto</SelectItem>
            <SelectItem value="em_andamento">Em Manutenção</SelectItem>
            <SelectItem value="aguardando">Peças/Aguardar</SelectItem>
            <SelectItem value="resolvido" className="text-green-600 font-bold">
              ✓ Concluir
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    {ticket.status === 'pendente' && canChangeStatus && (
      <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
        <div className="flex items-center gap-3 text-purple-800 dark:text-purple-300">
          <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold">Aguardando Aprovação do Gestor</p>
            <p className="text-sm opacity-90">
              Este ticket foi criado e aguarda que um Gestor de Assistência o aceite para iniciar a
              manutenção.
            </p>
          </div>
        </div>
        <Button
          onClick={() => onStatusChange('aberto')}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-8 shadow-lg shadow-purple-500/20"
        >
          Aprovar e Abrir Ticket
        </Button>
      </div>
    )}
  </>
);
