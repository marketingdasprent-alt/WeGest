import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type KpiColor = 'green' | 'blue' | 'amber' | 'violet' | 'red';

const COLOR_CLASSES: Record<KpiColor, { border: string; icon: string; value: string }> = {
  green: { border: 'border-l-green-500', icon: 'text-green-500', value: 'text-green-500' },
  blue: { border: 'border-l-blue-500', icon: 'text-blue-500', value: 'text-blue-500' },
  amber: { border: 'border-l-amber-500', icon: 'text-amber-500', value: 'text-amber-500' },
  violet: { border: 'border-l-violet-500', icon: 'text-violet-500', value: 'text-violet-500' },
  red: { border: 'border-l-destructive', icon: 'text-destructive', value: 'text-destructive' },
};

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  color: KpiColor;
  onClick?: () => void;
  /** Linha extra por baixo do valor — texto simples ou um Badge, conforme o cartão. */
  footer?: React.ReactNode;
}

/** Cartão de KPI do topo do dashboard — mesma estrutura, cor/ícone/valor variam por chamada. */
export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  icon: Icon,
  color,
  onClick,
  footer,
}) => {
  const c = COLOR_CLASSES[color];
  return (
    <Card
      className={cn(
        'border-l-4 transition-colors',
        c.border,
        onClick && 'cursor-pointer hover:bg-accent/50'
      )}
      onClick={onClick}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
          <Icon className={cn('h-4 w-4', c.icon)} />
        </div>
        <div className={cn('text-3xl font-bold', c.value)}>{value}</div>
        {footer}
      </CardContent>
    </Card>
  );
};
