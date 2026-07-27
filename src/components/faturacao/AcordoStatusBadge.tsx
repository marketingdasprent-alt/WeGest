/**
 * Padrão idêntico a EstadoFinanceiroBadge.tsx — Record<Enum,string> de
 * classes Tailwind + Badge outline. Cores alinhadas com o resto dos badges
 * financeiros do repo (estadoCobranca.ts, EstadoFinanceiroBadge.tsx):
 * ativo=azul, liquidado=esmeralda, incumprimento=vermelho, cancelado=muted.
 */
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type AcordoEstado = 'ativo' | 'liquidado' | 'incumprimento' | 'cancelado';

const ACORDO_ESTADO_STYLES: Record<AcordoEstado, string> = {
  ativo: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  liquidado: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  incumprimento: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  cancelado: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

const ACORDO_ESTADO_LABELS: Record<AcordoEstado, string> = {
  ativo: 'Ativo',
  liquidado: 'Liquidado',
  incumprimento: 'Incumprimento',
  cancelado: 'Cancelado',
};

export function AcordoStatusBadge({ estado }: { estado: AcordoEstado }) {
  return (
    <Badge variant="outline" className={cn('font-medium', ACORDO_ESTADO_STYLES[estado])}>
      {ACORDO_ESTADO_LABELS[estado]}
    </Badge>
  );
}
