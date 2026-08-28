import { useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { inserirToken, sugestoesDeToken } from '../tokens';

/**
 * Campo de texto com autocomplete de tokens.
 *
 * Escrever `{{` abre a lista de campos disponíveis; arrastar um campo da
 * coluna da esquerda insere o token na posição do cursor.
 */
export function CampoComTokens({
  valor,
  campos,
  onAlterar,
  linhas = 6,
}: {
  valor: string;
  campos: string[];
  onAlterar: (v: string) => void;
  linhas?: number;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  const [indice, setIndice] = useState(0);

  const sugestoes = sugestoesDeToken(valor, cursor, campos);

  const aplicar = (campo: string) => {
    const r = inserirToken(valor, cursor, campo);
    onAlterar(r.texto);
    // O cursor tem de ir para depois do token, senão a lista reabre logo com
    // o mesmo termo e parece que o autocomplete não fechou.
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(r.cursor, r.cursor);
      setCursor(r.cursor);
    });
  };

  const aoTeclar = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!sugestoes.activo || sugestoes.sugestoes.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = sugestoes.sugestoes.length;
      setIndice((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      aplicar(sugestoes.sugestoes[indice] ?? sugestoes.sugestoes[0]);
    }
  };

  return (
    <div className="relative">
      <Textarea
        ref={area}
        rows={linhas}
        value={valor}
        onChange={(e) => {
          onAlterar(e.target.value);
          setCursor(e.target.selectionStart);
          setIndice(0);
        }}
        onKeyUp={(e) => setCursor(e.currentTarget.selectionStart)}
        onClick={(e) => setCursor(e.currentTarget.selectionStart)}
        onKeyDown={aoTeclar}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const token = e.dataTransfer.getData('text/plain');
          const pos = area.current?.selectionStart ?? valor.length;
          onAlterar(valor.slice(0, pos) + token + valor.slice(pos));
        }}
        className="font-mono text-xs"
      />

      {sugestoes.activo && sugestoes.sugestoes.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-40 w-56 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {sugestoes.sugestoes.map((c, i) => (
            <li key={c}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // mousedown e não click: o click chegava depois do blur e o
                  // cursor já se tinha perdido.
                  e.preventDefault();
                  aplicar(c);
                }}
                className={cn(
                  'w-full rounded px-2 py-1 text-left font-mono text-xs',
                  i === indice ? 'bg-accent/15 text-foreground' : 'text-muted-foreground'
                )}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
