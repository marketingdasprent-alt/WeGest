import { useRef, useState } from 'react';
import { ImageUp, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface ZonaFotoModeloProps {
  imagemUrl: string | null;
  aCarregar: boolean;
  onFicheiro: (ficheiro: File) => void;
}

/** Zona onde se arrasta (ou escolhe) a foto do modelo, com a foto actual lá dentro. */
export function ZonaFotoModelo({ imagemUrl, aCarregar, onFicheiro }: ZonaFotoModeloProps) {
  const input = useRef<HTMLInputElement>(null);
  const [porCima, setPorCima] = useState(false);

  const receber = (lista: FileList | null) => {
    const ficheiro = lista?.[0];
    if (ficheiro && !aCarregar) onFicheiro(ficheiro);
  };

  return (
    <>
      <button
        type="button"
        disabled={aCarregar}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setPorCima(true);
        }}
        onDragLeave={() => setPorCima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setPorCima(false);
          receber(e.dataTransfer.files);
        }}
        className={cn(
          'flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors',
          porCima ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
          aCarregar && 'cursor-wait opacity-60'
        )}
      >
        {imagemUrl ? (
          <img
            src={imagemUrl}
            alt="Foto do modelo para o site"
            className="pointer-events-none h-24 w-auto rounded-md object-contain"
          />
        ) : (
          <ImageUp className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="pointer-events-none flex items-center gap-2 text-sm font-medium">
          {aCarregar && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {aCarregar
            ? 'A carregar…'
            : imagemUrl
              ? 'Arraste outra foto para a substituir'
              : 'Arraste a foto para aqui'}
        </span>
        {!aCarregar && (
          <span className="pointer-events-none text-xs text-muted-foreground">
            ou clique para escolher
          </span>
        )}
      </button>
      <input
        ref={input}
        id="modelo-foto"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          receber(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}
