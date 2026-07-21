// src/components/admin/DocumentoSuplementarList.tsx
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileText, Download, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRemoveDocumentoSuplementar, getDocumentoSuplementarSignedUrl } from '@/hooks/useDocumentosSuplementares';
import type { DocumentoSuplementarComEmpresas } from '@/types/documentoSuplementar';

interface DocumentoSuplementarListProps {
  documentos: DocumentoSuplementarComEmpresas[];
  nomePorEmpresa: Record<string, string>;
  isLoading: boolean;
  onEdit: (documento: DocumentoSuplementarComEmpresas) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const DocumentoSuplementarList = ({
  documentos,
  nomePorEmpresa,
  isLoading,
  onEdit,
}: DocumentoSuplementarListProps) => {
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<DocumentoSuplementarComEmpresas | null>(null);
  const removeMutation = useRemoveDocumentoSuplementar();

  const handleDownload = async (doc: DocumentoSuplementarComEmpresas) => {
    const url = await getDocumentoSuplementarSignedUrl(doc.ficheiro_url);
    if (!url) {
      toast({
        title: 'Erro ao descarregar',
        description: 'Não foi possível gerar o link do ficheiro.',
        variant: 'destructive',
      });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">A carregar...</div>;
  }

  if (documentos.length === 0) {
    return (
      <div className="border rounded-lg py-12 text-center text-muted-foreground">
        Nenhum documento suplementar encontrado.
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {documentos.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center gap-3 px-4 py-3 border rounded-lg hover:bg-muted/30 transition-colors"
          >
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium truncate">{doc.nome}</p>
                <Badge variant={doc.ativo ? 'default' : 'secondary'} className="text-xs">
                  {doc.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <div className="flex items-center gap-1 flex-wrap mt-1">
                {doc.empresaIds.map((id) => (
                  <Badge key={id} variant="outline" className="text-xs">
                    {nomePorEmpresa[id] || id}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatBytes(doc.tamanho_bytes)} · {formatDate(doc.updated_at)}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleDownload(doc)}
                title="Descarregar"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(doc)} title="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(doc)}
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar documento suplementar?</AlertDialogTitle>
            <AlertDialogDescription>
              O ficheiro <strong>{deleteTarget?.nome}</strong> será removido permanentemente para todas as
              empresas associadas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  removeMutation.mutate(deleteTarget, { onSuccess: () => setDeleteTarget(null) });
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
