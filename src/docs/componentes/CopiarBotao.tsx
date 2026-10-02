import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Estado = 'pronto' | 'copiado' | 'falhou';

interface Props {
  texto: string;
  rotulo?: string;
  /** Classes do botão (no bloco de código o fundo é escuro). */
  className?: string;
}

/** Copiar com confirmação em aria-live durante 2 s; sem toast. */
export function CopiarBotao({ texto, rotulo = 'Copiar código', className }: Props) {
  const [estado, setEstado] = useState<Estado>('pronto');
  const temporizador = useRef<number>();
  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado('copiado');
    } catch {
      setEstado('falhou');
    }
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setEstado('pronto'), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <span aria-live="polite" className={cn('text-xs', estado === 'falhou' && 'text-destructive')}>
        {estado === 'copiado' ? 'Copiado' : estado === 'falhou' ? 'Não foi possível copiar' : ''}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8', className)}
        aria-label={rotulo}
        onClick={copiar}
      >
        {estado === 'copiado' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
