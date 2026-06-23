import type React from 'react';
import { Car, CarTaxiFront, KeyRound, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { REGIME_LABELS, type ReservaRegime } from '@/types/reserva';

const STYLE: Record<ReservaRegime, string> = {
  rent_a_car: 'border-brand-navy/30 bg-brand-navy/10 text-brand-navy',
  tvde: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  slot: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

const ICON: Record<ReservaRegime, LucideIcon> = {
  rent_a_car: Car,
  tvde: CarTaxiFront,
  slot: KeyRound,
};

/** Chip de regime (Rent-a-Car / TVDE) com ícone e cor. */
export const RegimeBadge: React.FC<{ regime: ReservaRegime | null | undefined }> = ({ regime }) => {
  const safe: ReservaRegime = regime ?? 'rent_a_car';
  const Icon = ICON[safe];
  return (
    <Badge variant="outline" className={cn('gap-1 font-medium', STYLE[safe])}>
      <Icon className="h-3 w-3" />
      {REGIME_LABELS[safe]}
    </Badge>
  );
};
