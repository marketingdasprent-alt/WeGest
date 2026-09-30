import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImageOff, Maximize2, Star, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FotoViatura } from '@/hooks/useFotosViatura';

interface FotoViaturaItemProps {
  foto: FotoViatura;
  posicao: number;
  podeEditar: boolean;
  onAmpliar: (foto: FotoViatura) => void;
  onDefinirCapa: (foto: FotoViatura) => void;
  onRemover: (foto: FotoViatura) => void;
}

/** Uma foto na grelha: arrasta-se pela pega (ou pelo teclado), a primeira é a capa. */
export function FotoViaturaItem({
  foto,
  posicao,
  podeEditar,
  onAmpliar,
  onDefinirCapa,
  onRemover,
}: FotoViaturaItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: foto.id,
    disabled: !podeEditar,
  });
  const eCapa = posicao === 0;
  const src = foto.miniaturaUrl ?? foto.url;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-muted',
        eCapa ? 'border-primary ring-2 ring-primary/40' : 'border-border',
        isDragging && 'z-10 opacity-60 shadow-lg'
      )}
    >
      <button
        type="button"
        onClick={() => onAmpliar(foto)}
        className="block aspect-[4/3] w-full"
        aria-label={`Ampliar foto ${posicao + 1}`}
      >
        {src ? (
          <img
            src={src}
            alt={foto.nome ?? `Foto ${posicao + 1}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-6 w-6" aria-hidden="true" />
          </span>
        )}
      </button>

      <span
        className={cn(
          'absolute left-2 top-2 rounded px-1.5 py-0.5 text-[11px] font-semibold',
          eCapa ? 'bg-primary text-primary-foreground' : 'bg-background/85 text-foreground'
        )}
      >
        {eCapa ? 'Capa' : posicao + 1}
      </span>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5">
        {podeEditar ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none rounded p-1 text-white hover:bg-white/20 active:cursor-grabbing"
            aria-label={`Arrastar foto ${posicao + 1}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-white hover:bg-white/20 hover:text-white"
            onClick={() => onAmpliar(foto)}
            aria-label="Ver em grande"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          {podeEditar && !eCapa && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-white hover:bg-white/20 hover:text-white"
              onClick={() => onDefinirCapa(foto)}
              aria-label="Definir como capa"
              title="Definir como capa"
            >
              <Star className="h-3.5 w-3.5" />
            </Button>
          )}
          {podeEditar && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-white hover:bg-destructive/80 hover:text-white"
              onClick={() => onRemover(foto)}
              aria-label="Remover foto"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
