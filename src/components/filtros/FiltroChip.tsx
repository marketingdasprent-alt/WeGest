import { Check, ChevronDown, X } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface FiltroChipOpcao {
  value: string;
  label: string;
  /** Quantos resultados dá esta opção — mostrado à direita. */
  count?: number;
}

interface FiltroChipProps {
  label: string;
  value: string;
  options: readonly FiltroChipOpcao[];
  onChange: (value: string) => void;
  /** Valor "sem filtro" (por omissão 'all'): o chip fica neutro e sem ✕. */
  valorNeutro?: string;
}

/** Filtro compacto "Etiqueta: Valor ▾". Activo fica destacado e com ✕ para limpar. */
export function FiltroChip({
  label,
  value,
  options,
  onChange,
  valorNeutro = 'all',
}: FiltroChipProps) {
  const activo = value !== valorNeutro;
  const escolhida = options.find((o) => o.value === value);

  return (
    <div
      className={cn(
        'inline-flex h-8 items-center rounded-full border text-sm transition-colors',
        activo ? 'border-primary/50 bg-primary/10 text-primary' : 'bg-background hover:bg-muted/50'
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-full items-center gap-1 rounded-full pl-3',
              activo ? 'pr-1' : 'pr-2.5'
            )}
          >
            <span className={cn(!activo && 'text-muted-foreground')}>{label}:</span>
            <span className="font-medium">{escolhida?.label ?? '—'}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[14rem]">
          {options.map((o) => (
            <DropdownMenuItem
              key={o.value}
              onSelect={() => onChange(o.value)}
              className="flex items-center gap-2"
            >
              <Check
                className={cn('h-4 w-4', o.value === value ? 'opacity-100' : 'opacity-0')}
                aria-hidden="true"
              />
              <span className="flex-1">{o.label}</span>
              {o.count !== undefined && (
                <span className="text-xs tabular-nums text-muted-foreground">{o.count}</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {activo && (
        <button
          type="button"
          onClick={() => onChange(valorNeutro)}
          className="mr-1 rounded-full p-1 hover:bg-primary/15"
          aria-label={`Limpar filtro ${label}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
