import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';

/**
 * Configuração visual partilhada por TicketDetails, Assistencia, etc.
 * Mantida aqui para evitar duplicação.
 */
export const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> =
  {
    pendente: {
      label: 'Pendente de Aprovação',
      color: 'bg-purple-600',
      icon: <Clock className="h-4 w-4" />,
    },
    aberto: { label: 'Aberto', color: 'bg-blue-500', icon: <AlertCircle className="h-4 w-4" /> },
    em_andamento: {
      label: 'Em Manutenção',
      color: 'bg-yellow-500',
      icon: <Clock className="h-4 w-4" />,
    },
    aguardando: {
      label: 'Aguardando Peças',
      color: 'bg-orange-500',
      icon: <Clock className="h-4 w-4" />,
    },
    resolvido: {
      label: 'Concluído',
      color: 'bg-green-500',
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    fechado: {
      label: 'Fechado',
      color: 'bg-gray-500',
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
  };

export const prioridadeConfig: Record<string, { label: string; color: string }> = {
  baixa: { label: 'Baixa', color: 'bg-gray-400' },
  media: { label: 'Média', color: 'bg-blue-400' },
  alta: { label: 'Alta', color: 'bg-orange-500' },
  urgente: { label: 'Urgente', color: 'bg-red-500' },
};
