import { format } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';

interface TiAvisoResolvidoProps {
  resolvidoPorNome: string | null;
  resolvidoEm: string | null;
}

/** Fim da conversa de um pedido resolvido: quem tratou e quando. */
export function TiAvisoResolvido({ resolvidoPorNome, resolvidoEm }: TiAvisoResolvidoProps) {
  return (
    <div className="mx-auto flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {resolvidoPorNome ? (
        <span>
          Resolvido por <b>{resolvidoPorNome}</b>
          {resolvidoEm && ` a ${format(new Date(resolvidoEm), 'dd/MM/yyyy HH:mm')}`}
        </span>
      ) : (
        // Pedidos fechados antes de se registar quem resolve.
        <span>Resolvido</span>
      )}
    </div>
  );
}
