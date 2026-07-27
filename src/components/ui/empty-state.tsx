import * as React from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** Botão/acção que resolve o estado vazio (ex.: "+ Adicionar"). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Estado vazio consistente para listagens — em vez de uma frase morta,
 * guia para a próxima acção. Usar em qualquer lista/tabela sem resultados.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 py-12 px-4 text-center',
        className
      )}
    >
      <Icon className="mb-2 h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
