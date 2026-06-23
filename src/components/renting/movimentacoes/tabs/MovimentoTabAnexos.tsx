import { useRef, useState } from 'react';
import {
  Check,
  Clock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useToast } from '@/hooks/use-toast';
import {
  useMovimentoAnexos,
  useUploadMovimentoAnexo,
  useRenameMovimentoAnexo,
  useDeleteMovimentoAnexo,
  getMovimentoAnexoSignedUrl,
} from '@/hooks/useMovimentoAnexos';
import type { MovimentoAnexo } from '@/types/movimento';

export type AnexoPendente = {
  id: string;
  file: File;
  nome: string;
};

interface MovimentoTabAnexosProps {
  movimentoId: string | null;
  pendentes: AnexoPendente[];
  onAdicionarPendentes: (files: File[]) => void;
  onRenomearPendente: (id: string, nome: string) => void;
  onRemoverPendente: (id: string) => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

function formatBytes(bytes: number | null): string {
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
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function iconForMime(mime: string | null): React.ReactNode {
  if (mime?.startsWith('image/'))
    return <ImageIcon className="h-5 w-5 text-emerald-500 shrink-0" />;
  return <FileText className="h-5 w-5 text-primary shrink-0" />;
}

export const MovimentoTabAnexos: React.FC<MovimentoTabAnexosProps> = ({
  movimentoId,
  pendentes,
  onAdicionarPendentes,
  onRenomearPendente,
  onRemoverPendente,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MovimentoAnexo | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameBuffer, setRenameBuffer] = useState('');
  const { toast } = useToast();

  const { data: anexos = [], isLoading } = useMovimentoAnexos(movimentoId);
  const uploadMutation = useUploadMovimentoAnexo(movimentoId);
  const renameMutation = useRenameMovimentoAnexo(movimentoId);
  const deleteMutation = useDeleteMovimentoAnexo(movimentoId);

  const modoCriar = !movimentoId;

  const handleFiles = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const files = Array.from(filesList);

    if (modoCriar) {
      onAdicionarPendentes(files);
    } else {
      for (const file of files) {
        await uploadMutation.mutateAsync({ file }).catch(() => {});
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAbrir = async (anexo: MovimentoAnexo) => {
    const url = await getMovimentoAnexoSignedUrl(anexo.ficheiro_url);
    if (!url) {
      toast({
        title: 'Erro ao abrir',
        description: 'Não foi possível gerar o link do ficheiro.',
        variant: 'destructive',
      });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const iniciarRename = (id: string, nomeAtual: string) => {
    setRenamingId(id);
    setRenameBuffer(nomeAtual);
  };

  const cancelarRename = () => {
    setRenamingId(null);
    setRenameBuffer('');
  };

  const confirmarRenamePersistido = async (id: string) => {
    if (!renameBuffer.trim()) return cancelarRename();
    await renameMutation.mutateAsync({ id, nome: renameBuffer }).catch(() => {});
    setRenamingId(null);
    setRenameBuffer('');
  };

  const confirmarRenamePendente = (id: string) => {
    const novo = renameBuffer.trim();
    if (novo) onRenomearPendente(id, novo);
    setRenamingId(null);
    setRenameBuffer('');
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/30'
        }`}
      >
        <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium mb-1">
          Arrasta fotos aqui ou{' '}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-primary hover:underline"
          >
            selecciona do dispositivo
          </button>
        </p>
        <p className="text-xs text-muted-foreground">
          Fotos (JPG/PNG/WebP/HEIC) e PDF · máximo 20 MB cada
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        {uploadMutation.isPending && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />A carregar...
          </div>
        )}
      </div>

      {/* Aviso de pendentes (modo criar) */}
      {modoCriar && pendentes.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
          <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p>
            <strong>
              {pendentes.length} ficheiro{pendentes.length === 1 ? '' : 's'} pendente
              {pendentes.length === 1 ? '' : 's'}
            </strong>{' '}
            — só serão guardados quando criares o movimento.
          </p>
        </div>
      )}

      {/* Lista de pendentes (modo criar) */}
      {modoCriar && pendentes.length > 0 && (
        <ul className="space-y-2">
          {pendentes.map((p) => {
            const isRenaming = renamingId === p.id;
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 px-4 py-3 border rounded-lg border-amber-500/30 bg-amber-500/[0.03]"
              >
                {iconForMime(p.file.type)}
                <div className="flex-1 min-w-0">
                  {isRenaming ? (
                    <Input
                      autoFocus
                      value={renameBuffer}
                      onChange={(e) => setRenameBuffer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          confirmarRenamePendente(p.id);
                        } else if (e.key === 'Escape') {
                          cancelarRename();
                        }
                      }}
                      className="h-8 text-sm bg-background"
                    />
                  ) : (
                    <p className="text-sm font-medium truncate flex items-center gap-2">
                      {p.nome}
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold shrink-0">
                        Pendente
                      </span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatBytes(p.file.size)} · {p.file.type || 'tipo desconhecido'}
                  </p>
                </div>
                {isRenaming ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                      onClick={() => confirmarRenamePendente(p.id)}
                      title="Guardar"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={cancelarRename}
                      title="Cancelar"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => iniciarRename(p.id, p.nome)}
                      title="Renomear"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => onRemoverPendente(p.id)}
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Lista persistida (modo edit) */}
      {!modoCriar && (
        <>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : anexos.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Ainda não há fotos ou documentos para este movimento.
            </div>
          ) : (
            <ul className="space-y-2">
              {anexos.map((anexo) => {
                const isRenaming = renamingId === anexo.id;
                return (
                  <li
                    key={anexo.id}
                    className="flex items-center gap-3 px-4 py-3 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    {iconForMime(anexo.mime_type)}
                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <Input
                          autoFocus
                          value={renameBuffer}
                          onChange={(e) => setRenameBuffer(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              confirmarRenamePersistido(anexo.id);
                            } else if (e.key === 'Escape') {
                              cancelarRename();
                            }
                          }}
                          className="h-8 text-sm bg-background"
                        />
                      ) : (
                        <p className="text-sm font-medium truncate">{anexo.nome}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatBytes(anexo.tamanho_bytes)} · {formatDate(anexo.created_at)}
                      </p>
                    </div>
                    {isRenaming ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                          onClick={() => confirmarRenamePersistido(anexo.id)}
                          disabled={renameMutation.isPending}
                          title="Guardar"
                        >
                          {renameMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={cancelarRename}
                          title="Cancelar"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleAbrir(anexo)}
                          title="Abrir"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => iniciarRename(anexo.id, anexo.nome)}
                          title="Renomear"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(anexo)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* Empty state — modo criar sem pendentes */}
      {modoCriar && pendentes.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          Sem fotos adicionadas. Arrasta ou escolhe ficheiros acima.
        </div>
      )}

      {/* Confirmação de eliminação (só edit) */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar ficheiro?</AlertDialogTitle>
            <AlertDialogDescription>
              O ficheiro <strong>{deleteTarget?.nome}</strong> será removido permanentemente. Esta
              acção não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget, {
                    onSuccess: () => setDeleteTarget(null),
                  });
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
