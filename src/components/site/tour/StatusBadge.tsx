import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TONE_CLASSES = {
  green: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20',
  blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
  gray: 'bg-muted text-muted-foreground border-border',
  red: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20',
} as const;

const STATUS_TONE: Record<string, keyof typeof TONE_CLASSES> = {
  Ativo: 'green',
  Assinado: 'green',
  Disponível: 'green',
  Resolvido: 'green',
  Automática: 'green',
  Reservado: 'blue',
  'Em curso': 'blue',
  'Em Curso': 'blue',
  Facturado: 'blue',
  Aberto: 'blue',
  Pendente: 'amber',
  Manutenção: 'amber',
  Agendado: 'amber',
  Concluído: 'gray',
  Inativo: 'gray',
  Fechado: 'gray',
  Baixa: 'gray',
  Alugada: 'blue',
  'Em contrato': 'blue',
  'Em reserva': 'violet',
  Alta: 'red',
  Média: 'violet',
  'Pendente de aprovação': 'violet',
  'Não atribuído': 'gray',
  Enviado: 'green',
};

export const StatusBadge = ({ status }: { status: string }) => {
  const tone = STATUS_TONE[status] ?? 'gray';
  return (
    <Badge variant="outline" className={cn('font-normal', TONE_CLASSES[tone])}>
      {status}
    </Badge>
  );
};
