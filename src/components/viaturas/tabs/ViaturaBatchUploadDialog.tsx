import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FolderUp, FileText, Loader2 } from 'lucide-react';
import type { BatchViaturaEntry } from './viaturaTabDados.types';

interface ViaturaBatchUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchEntries: BatchViaturaEntry[];
  batchUploading: boolean;
  onUpload: () => void;
}

export function ViaturaBatchUploadDialog({
  open,
  onOpenChange,
  batchEntries,
  batchUploading,
  onUpload,
}: ViaturaBatchUploadDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!batchUploading) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderUp className="h-5 w-5" />
            Carregar Documentos em Lote
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[400px] overflow-y-auto">
          {batchEntries.map((entry, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 border rounded-lg ${
                entry.reconhecido ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}
            >
              <FileText
                className={`h-5 w-5 shrink-0 ${entry.reconhecido ? 'text-green-600' : 'text-red-400'}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.file.name}</p>
                <p className={`text-xs ${entry.reconhecido ? 'text-green-600' : 'text-red-500'}`}>
                  {entry.reconhecido
                    ? `→ ${entry.labelDetectado}`
                    : 'Tipo não reconhecido — será ignorado'}
                </p>
              </div>
              {entry.reconhecido && (
                <Badge variant="outline" className="text-xs shrink-0 border-green-300 text-green-700">
                  {entry.labelDetectado}
                </Badge>
              )}
            </div>
          ))}
        </div>
        {batchEntries.some((e) => !e.reconhecido) && (
          <p className="text-xs text-muted-foreground">
            Prefixos reconhecidos: DUAF, DUAV, IPO, DAV, AC, CV
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={batchUploading}>
            Cancelar
          </Button>
          <Button
            onClick={onUpload}
            disabled={batchUploading || !batchEntries.some((e) => e.reconhecido)}
          >
            {batchUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />A carregar...
              </>
            ) : (
              `Carregar ${batchEntries.filter((e) => e.reconhecido).length} ficheiro(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
