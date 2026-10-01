import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

import { cn } from '@/lib/utils';

interface ZonaFicheirosProps {
  onFicheiros: (ficheiros: File[]) => void;
  desactivada?: boolean;
}

/** Larga aqui todos os ficheiros da semana, de todas as plataformas. */
export function ZonaFicheiros({ onFicheiros, desactivada }: ZonaFicheirosProps) {
  const input = useRef<HTMLInputElement>(null);
  const [porCima, setPorCima] = useState(false);

  const receber = (lista: FileList | null) => {
    const ficheiros = Array.from(lista ?? []);
    if (ficheiros.length > 0) onFicheiros(ficheiros);
  };

  return (
    <button
      type="button"
      disabled={desactivada}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setPorCima(true);
      }}
      onDragLeave={() => setPorCima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setPorCima(false);
        if (!desactivada) receber(e.dataTransfer.files);
      }}
      className={cn(
        'flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
        porCima ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        desactivada && 'cursor-not-allowed opacity-60'
      )}
    >
      <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <span className="text-sm font-medium">Largue aqui os ficheiros da semana</span>
      <span className="text-xs text-muted-foreground">
        Uber, Bolt, Repsol, EDP, BP e Via Verde, todos de uma vez. O sistema descobre a conta e a
        semana de cada um.
      </span>
      <input
        ref={input}
        type="file"
        multiple
        accept=".csv,.txt,.xlsx,.xls"
        className="hidden"
        aria-label="Escolher ficheiros"
        onChange={(e) => {
          receber(e.target.files);
          e.target.value = '';
        }}
      />
    </button>
  );
}
