import { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FotosViaturaDropzoneProps {
  vagas: number;
  aCarregar: boolean;
  onFicheiros: (ficheiros: File[]) => void;
}

/** Arrastar ficheiros para aqui, clicar para escolher, ou tirar foto no telemóvel. */
export function FotosViaturaDropzone({ vagas, aCarregar, onFicheiros }: FotosViaturaDropzoneProps) {
  const ficheirosRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [porCima, setPorCima] = useState(false);
  const desligado = aCarregar || vagas <= 0;

  const entregar = (lista: FileList | null) => {
    if (lista?.length) onFicheiros(Array.from(lista));
  };

  return (
    <div
      onDragOver={(e) => {
        if (desligado || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setPorCima(true);
      }}
      onDragLeave={() => setPorCima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setPorCima(false);
        if (!desligado) entregar(e.dataTransfer.files);
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
        porCima ? 'border-primary bg-primary/5' : 'border-border',
        desligado && 'opacity-60'
      )}
    >
      <input
        ref={ficheirosRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          entregar(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          entregar(e.target.files);
          e.target.value = '';
        }}
      />

      {aCarregar ? (
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      ) : (
        <ImagePlus className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      )}
      <p className="text-sm">
        {aCarregar
          ? 'A carregar as fotos…'
          : vagas > 0
            ? `Arraste fotos para aqui — cabem mais ${vagas}.`
            : 'Esta viatura já tem o máximo de fotos. Remova uma para adicionar outra.'}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={desligado}
          onClick={() => ficheirosRef.current?.click()}
        >
          <ImagePlus className="mr-1.5 h-4 w-4" /> Escolher fotos
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={desligado}
          onClick={() => cameraRef.current?.click()}
          className="md:hidden"
        >
          <Camera className="mr-1.5 h-4 w-4" /> Câmara
        </Button>
      </div>
    </div>
  );
}
