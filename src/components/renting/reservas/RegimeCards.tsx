import type React from 'react';
import { Car, CarTaxiFront, Check, KeyRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReservaRegime } from '@/types/reserva';

interface RegimeOption {
  value: ReservaRegime;
  label: string;
  desc: string;
  icon: LucideIcon;
  accent: 'navy' | 'emerald' | 'amber';
}

const OPTIONS: RegimeOption[] = [
  {
    value: 'rent_a_car',
    label: 'Rent-a-Car',
    desc: 'Aluguer ao cliente · faturação diária ou mensal',
    icon: Car,
    accent: 'navy',
  },
  {
    value: 'tvde',
    label: 'TVDE',
    desc: 'Plataformas · mensal ao cliente, semanal ao condutor',
    icon: CarTaxiFront,
    accent: 'emerald',
  },
  {
    value: 'slot',
    label: 'Slot',
    desc: 'Carro do motorista · paga semanalmente pelo slot',
    icon: KeyRound,
    accent: 'amber',
  },
];

const ACCENT = {
  navy: {
    selected: 'border-brand-navy bg-brand-navy/5',
    hover: 'hover:border-brand-navy/40',
    iconOn: 'bg-brand-navy text-brand-navy-foreground',
    check: 'text-brand-navy',
  },
  emerald: {
    selected: 'border-emerald-500 bg-emerald-500/5',
    hover: 'hover:border-emerald-500/40',
    iconOn: 'bg-emerald-500 text-white',
    check: 'text-emerald-600 dark:text-emerald-400',
  },
  amber: {
    selected: 'border-amber-500 bg-amber-500/5',
    hover: 'hover:border-amber-500/40',
    iconOn: 'bg-amber-500 text-white',
    check: 'text-amber-600 dark:text-amber-400',
  },
} as const;

interface RegimeCardsProps {
  value: ReservaRegime;
  onChange: (v: ReservaRegime) => void;
  /** Mostra o cartão Slot (gated pelo módulo). Default true (fail-open). */
  allowSlot?: boolean;
}

/** Seletor de regime em cartões clicáveis — substitui o dropdown. */
export const RegimeCards: React.FC<RegimeCardsProps> = ({ value, onChange, allowSlot = true }) => {
  // Slot só aparece se o módulo estiver activo (ou já estar selecionado).
  const options = OPTIONS.filter((o) => o.value !== 'slot' || allowSlot || value === 'slot');
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3',
        options.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
      )}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        const a = ACCENT[opt.accent];
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            className={cn(
              'group relative flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all duration-200',
              selected
                ? cn(a.selected, 'shadow-sm')
                : cn(
                    'border-border bg-background hover:-translate-y-0.5 hover:bg-muted/40',
                    a.hover
                  )
            )}
          >
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors',
                selected ? a.iconOn : 'bg-muted text-muted-foreground group-hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 pr-5">
              <p className="font-semibold leading-tight">{opt.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{opt.desc}</p>
            </div>
            {selected && <Check className={cn('absolute right-3 top-3 h-4 w-4', a.check)} />}
          </button>
        );
      })}
    </div>
  );
};
