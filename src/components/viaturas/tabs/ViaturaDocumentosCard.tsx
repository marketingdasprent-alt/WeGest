import type { RefObject } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  FileText,
  Eye,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FolderUp,
  Loader2,
} from 'lucide-react';
import { DOCUMENTOS_VIATURA, type ViaturaDocument } from './viaturaTabDados.types';

interface ViaturaDocumentosCardProps {
  isNew: boolean;
  batchInputRef: RefObject<HTMLInputElement>;
  onBatchSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  getDocumentByType: (tipo: string) => ViaturaDocument | undefined;
  uploadingDoc: string | null;
  onUpload: (tipo: string, file: File) => void;
  onView: (doc: ViaturaDocument) => void;
  onDelete: (doc: ViaturaDocument) => void;
  podeEliminar: boolean;
}

export function ViaturaDocumentosCard({
  isNew,
  batchInputRef,
  onBatchSelect,
  getDocumentByType,
  uploadingDoc,
  onUpload,
  onView,
  onDelete,
  podeEliminar,
}: ViaturaDocumentosCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documentos
        </CardTitle>
        {!isNew && (
          <>
            <input
              type="file"
              multiple
              className="hidden"
              ref={batchInputRef}
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={onBatchSelect}
            />
            <Button variant="outline" size="sm" onClick={() => batchInputRef.current?.click()}>
              <FolderUp className="h-4 w-4 mr-2" />
              Carregar em Lote
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isNew ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Guarde a viatura primeiro para anexar documentos.
          </p>
        ) : (
          DOCUMENTOS_VIATURA.map((doc) => {
            const existingDoc = getDocumentByType(doc.tipo);
            const isUploading = uploadingDoc === doc.tipo;

            return (
              <div key={doc.tipo} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {existingDoc ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : doc.obrigatorio ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{doc.label}</span>
                  </div>
                  {doc.obrigatorio && !existingDoc && (
                    <Badge variant="destructive" className="text-xs">
                      Obrigatório
                    </Badge>
                  )}
                </div>

                {existingDoc ? (
                  <div className="flex items-center justify-between bg-muted/50 rounded px-2 py-1.5">
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {existingDoc.nome_ficheiro || 'Documento anexado'}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => onView(existingDoc)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {podeEliminar && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => onDelete(existingDoc)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onUpload(doc.tipo, file);
                      }}
                      disabled={isUploading}
                    />
                    <div className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-2 hover:bg-muted/50 transition-colors">
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Anexar documento</span>
                        </>
                      )}
                    </div>
                  </label>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
