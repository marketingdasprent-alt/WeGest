import { Globe, UserCheck, type LucideIcon } from 'lucide-react';
import type { Reserva } from '@/types/reserva';

export interface SeloReserva {
  chave: 'site' | 'confirmar_identidade';
  label: string;
  titulo: string;
  classe: string;
  icon: LucideIcon;
}

const SELO_SITE: SeloReserva = {
  chave: 'site',
  label: 'Site',
  titulo: 'Reserva feita no site da Década: confirmar e, se preciso, trocar a viatura',
  classe: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  icon: Globe,
};

const SELO_IDENTIDADE: SeloReserva = {
  chave: 'confirmar_identidade',
  label: 'Confirmar identidade',
  titulo: 'Os dados enviados pelo site não coincidem com a ficha do cliente',
  classe: 'border-muted-foreground/30 bg-transparent text-muted-foreground',
  icon: UserCheck,
};

/** Selos a mostrar junto ao código: só as reservas vindas do site têm algum. */
export function selosDaReserva(reserva: Pick<Reserva, 'origem' | 'dados_site'>): SeloReserva[] {
  if (reserva.origem !== 'site') return [];
  return reserva.dados_site?.cliente_divergente === true
    ? [SELO_SITE, SELO_IDENTIDADE]
    : [SELO_SITE];
}
