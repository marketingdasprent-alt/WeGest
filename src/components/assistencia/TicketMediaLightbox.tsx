import React from 'react';
import { Download, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

/**
 * Ficheiro anexo a um ticket.
 *
 * Este tipo veio de components/assistencia/ticket/TicketMediaLightbox.tsx, uma
 * cópia quase igual deste ficheiro que ninguém importava. A cópia morta estava
 * MELHOR tipada do que a viva — tinha isto em vez de `any[]` — pelo que a
 * melhoria tinha sido feita no ficheiro errado e nunca chegou a correr. Trazido
 * para cá antes de a apagar.
 */
interface FicheiroTicket {
  id: string;
  ficheiro_url: string;
  nome_ficheiro: string;
  tipo_ficheiro: string | null;
  legenda?: string | null;
}

interface TicketMediaLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaList: FicheiroTicket[];
  currentIndex: number;
  onNext: (e?: React.MouseEvent) => void;
  onPrev: (e?: React.MouseEvent) => void;
  onDownload: (url: string, filename: string) => void;
}

export function TicketMediaLightbox({
  open,
  onOpenChange,
  mediaList,
  currentIndex,
  onNext,
  onPrev,
  onDownload,
}: TicketMediaLightboxProps) {
  const current = mediaList[currentIndex];
  const isVideo =
    current?.tipo_ficheiro === 'video' || current?.ficheiro_url?.match(/\.(mp4|webm|mov|ogg)$/i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 bg-black/95 border-none flex flex-col items-center justify-center overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Visualização de Multimédia</DialogTitle>
          <DialogDescription>
            Visualização em ecrã inteiro de fotos e vídeos do ticket.
          </DialogDescription>
        </DialogHeader>

        <div className="absolute top-4 right-4 z-50 flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 rounded-full"
            onClick={() => onDownload(current?.ficheiro_url, current?.nome_ficheiro)}
            aria-label={
              current?.nome_ficheiro ? `Descarregar ${current.nome_ficheiro}` : 'Descarregar'
            }
          >
            <Download className="h-5 w-5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 rounded-full"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-12">
          {mediaList.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 sm:left-6 z-40 text-white hover:bg-white/20 rounded-full h-12 w-12"
                onClick={onPrev}
                aria-label="Ficheiro anterior"
              >
                <ChevronLeft className="h-8 w-8" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 sm:right-6 z-40 text-white hover:bg-white/20 rounded-full h-12 w-12"
                onClick={onNext}
                aria-label="Ficheiro seguinte"
              >
                <ChevronRight className="h-8 w-8" aria-hidden="true" />
              </Button>
            </>
          )}

          <div className="max-w-full max-h-full flex flex-col items-center gap-4">
            {isVideo ? (
              <video
                src={current?.ficheiro_url}
                controls
                autoPlay
                className="max-w-full max-h-[75vh] rounded-lg shadow-2xl"
              />
            ) : (
              <img
                src={current?.ficheiro_url}
                alt="Preview"
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
              />
            )}

            <div className="text-white text-center space-y-3 bg-black/60 p-4 rounded-xl backdrop-blur-md max-w-xl border border-white/10 shadow-2xl">
              {current?.legenda ? (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                    Legenda
                  </p>
                  <p className="text-lg text-green-400 font-semibold leading-tight">
                    {current.legenda}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-white/30 italic">Sem legenda definida</p>
              )}
              <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-4">
                <p className="text-[10px] text-white/40 truncate max-w-[200px]">
                  {current?.nome_ficheiro}
                </p>
                <p className="text-[10px] font-mono text-white/40 whitespace-nowrap">
                  {currentIndex + 1} / {mediaList.length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
