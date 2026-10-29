import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ErroReciboExplicado } from '@/lib/reciboErro';

interface ErroReciboAvisoProps {
  erro: ErroReciboExplicado;
  /** Linha extra no topo, ex.: o nº da fatura numa lista de vários recibos. */
  contexto?: string;
  className?: string;
}

export const ErroReciboAviso: React.FC<ErroReciboAvisoProps> = ({ erro, contexto, className }) => (
  <div
    role="alert"
    className={cn(
      'rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-1.5',
      className
    )}
  >
    <p className="flex items-start gap-1.5 font-semibold text-destructive">
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>
        {contexto && <span className="mr-1">{contexto}:</span>}
        {erro.titulo}
      </span>
    </p>
    <p className="text-foreground">{erro.oQueFazer}</p>
    <details className="text-muted-foreground">
      <summary className="cursor-pointer select-none">Mensagem técnica</summary>
      <p className="mt-1 break-words font-mono text-[10px]">{erro.detalhe}</p>
    </details>
  </div>
);
