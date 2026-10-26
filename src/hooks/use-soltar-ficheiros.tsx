import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';

/**
 * Ficheiros de um Ctrl+V. Se o clipboard também traz texto (células do Excel,
 * texto do Word), o colar é de texto e não se mexe: só anexa quando só há
 * ficheiros, como um print ou um PDF copiado no explorador.
 */
export function ficheirosColados(dados: Pick<DataTransfer, 'files' | 'getData'>): File[] {
  const ficheiros = Array.from(dados.files ?? []);
  if (ficheiros.length === 0 || dados.getData('text/plain')) return [];
  return ficheiros.map(renomearPrint);
}

/** Prints colados chegam todos como "image.png"; um nome com a hora distingue-os. */
function renomearPrint(f: File): File {
  if (!/^image\.(png|jpe?g|webp)$/i.test(f.name)) return f;
  const hora = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
  return new File([f], `print-${hora}.${f.name.split('.').pop()}`, { type: f.type });
}

function temFicheiros(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Arrastar e largar + colar ficheiros numa zona. Devolve os handlers a espalhar
 * no elemento e `aArrastar` para mostrar a zona activa.
 */
export function useSoltarFicheiros(onFicheiros: (ficheiros: File[]) => void, desactivado = false) {
  const [aArrastar, setAArrastar] = useState(false);
  // dragenter/dragleave disparam a cada filho atravessado; o contador evita o pisca.
  const profundidade = useRef(0);

  const fechar = () => {
    profundidade.current = 0;
    setAArrastar(false);
  };

  return {
    aArrastar: aArrastar && !desactivado,
    zona: {
      onDragEnter: (e: DragEvent) => {
        if (desactivado || !temFicheiros(e)) return;
        e.preventDefault();
        profundidade.current += 1;
        setAArrastar(true);
      },
      // Mesmo desactivada, a zona engole o largar: senão o browser abria o
      // ficheiro e saía da página.
      onDragOver: (e: DragEvent) => {
        if (temFicheiros(e)) e.preventDefault();
      },
      onDragLeave: (e: DragEvent) => {
        if (desactivado || !temFicheiros(e)) return;
        profundidade.current = Math.max(0, profundidade.current - 1);
        if (profundidade.current === 0) setAArrastar(false);
      },
      onDrop: (e: DragEvent) => {
        if (!temFicheiros(e)) return;
        e.preventDefault();
        fechar();
        if (desactivado) return;
        const ficheiros = Array.from(e.dataTransfer.files ?? []);
        if (ficheiros.length) onFicheiros(ficheiros);
      },
    },
    onPaste: (e: ClipboardEvent) => {
      if (desactivado) return;
      const ficheiros = ficheirosColados(e.clipboardData);
      if (ficheiros.length === 0) return;
      e.preventDefault();
      onFicheiros(ficheiros);
    },
  };
}
