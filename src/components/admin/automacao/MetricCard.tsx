import type { ComponentType } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-amber-600 dark:text-amber-400',
    destructive: 'text-destructive',
  }[tone];
  return (
    <Card>
      <CardContent className="pt-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
        </div>
        {Icon && <Icon className={`h-5 w-5 ${toneClass}`} />}
      </CardContent>
    </Card>
  );
}
