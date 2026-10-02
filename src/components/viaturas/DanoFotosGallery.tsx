import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Camera,
  Upload,
  Loader2,
  Eye,
  Trash2,
  ImageIcon,
  Wrench,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { indiceVizinho } from '@/utils/galeriaIndice';
import { toast } from 'sonner';

type DanoBucket = 'viatura-documentos' | 'assistencia-anexos' | 'viatura-danos';

/**
 * Detecta qual bucket usar baseado no path/URL. As fotos guardadas em
 * viatura_dano_fotos vêm de origens diferentes:
 *  - check-in/recolha/entrega → path nu no bucket viatura-danos
 *  - ViaturaTabDanos (upload manual) → URL http completo do viatura-documentos
 *  - anexos de assistência → bucket assistencia-anexos
 */
function detectBucket(urlOrPath: string): DanoBucket {
  if (urlOrPath.startsWith('assistencia/') || urlOrPath.includes('assistencia-anexos'))
    return 'assistencia-anexos';
  if (urlOrPath.includes('viatura-danos')) return 'viatura-danos';
  // Path nu (sem http) é sempre do bucket viatura-danos (check-in/recolha).
  if (!urlOrPath.startsWith('http')) return 'viatura-danos';
  return 'viatura-documentos';
}

/**
 * Aceita um valor guardado em ficheiro_url e retorna apenas o path
 * relativo ao bucket. Suporta dados antigos (publicUrl/signedUrl completa)
 * e dados novos (path puro).
 */
function extractStoragePath(urlOrPath: string): string {
  if (!urlOrPath.startsWith('http')) return urlOrPath;
  const match = urlOrPath.match(
    /\/storage\/v1\/object\/(?:public|sign)\/(?:viatura-documentos|assistencia-anexos|viatura-danos)\/([^?]+)/
  );
  return match ? decodeURIComponent(match[1]) : urlOrPath;
}

/** <img> com signed URL on-demand. Resolve src independente do que está em BD. */
function DanoFotoImage({
  ficheiroUrl,
  alt,
  onClick,
  className,
}: {
  ficheiroUrl: string;
  alt: string;
  onClick?: () => void;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = extractStoragePath(ficheiroUrl);
    const bucket = detectBucket(ficheiroUrl);
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 10)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          // Fallback: tenta o valor original (pode ser publicUrl válida)
          setSrc(ficheiroUrl);
        } else {
          setSrc(data.signedUrl);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ficheiroUrl]);

  if (!src) {
    return <div className={`${className} bg-muted animate-pulse`} aria-label={alt} />;
  }
  return <img src={src} alt={alt} className={className} onClick={onClick} />;
}

interface DanoFoto {
  id: string;
  ficheiro_url: string;
  nome_ficheiro: string | null;
  descricao: string | null;
}

interface DanoFotosGalleryProps {
  danoId: string;
  fotos: DanoFoto[];
  onFotosChange: () => void;
  readonly?: boolean;
}

export function DanoFotosGallery({
  danoId,
  fotos,
  onFotosChange,
  readonly = false,
}: DanoFotosGalleryProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedFoto = selectedIndex === null ? null : (fotos[selectedIndex] ?? null);
  const [editingDescricao, setEditingDescricao] = useState<{
    id: string;
    descricao: string;
  } | null>(null);
  const [updating, setUpdating] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${danoId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('viatura-documentos')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from('viatura-documentos').getPublicUrl(fileName);

        const { error: insertError } = await supabase.from('viatura_dano_fotos').insert({
          dano_id: danoId,
          ficheiro_url: publicUrl,
          nome_ficheiro: file.name,
          uploaded_by: user?.id,
        });

        if (insertError) throw insertError;
      }

      toast.success(`${files.length} foto(s) adicionada(s)!`);
      onFotosChange();
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      toast.error('Erro ao fazer upload das fotos');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (fotoId: string) => {
    if (!confirm('Tem certeza que deseja eliminar esta foto?')) return;

    try {
      const { error } = await supabase.from('viatura_dano_fotos').delete().eq('id', fotoId);

      if (error) throw error;
      toast.success('Foto eliminada!');
      onFotosChange();
    } catch (error) {
      console.error('Erro ao eliminar foto:', error);
      toast.error('Erro ao eliminar foto');
    }
  };

  const handleUpdateDescricao = async () => {
    if (!editingDescricao) return;

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('viatura_dano_fotos')
        .update({ descricao: editingDescricao.descricao })
        .eq('id', editingDescricao.id);

      if (error) throw error;

      toast.success('Descrição atualizada!');
      setEditingDescricao(null);
      onFotosChange();
    } catch (error) {
      console.error('Erro ao atualizar descrição:', error);
      toast.error('Erro ao atualizar descrição');
    } finally {
      setUpdating(false);
    }
  };

  const openLightbox = (foto: DanoFoto) => {
    setSelectedIndex(fotos.findIndex((f) => f.id === foto.id));
  };

  const navegar = (passo: 1 | -1) =>
    setSelectedIndex((i) => (i === null ? i : indiceVizinho(i, fotos.length, passo)));

  const handleLightboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') navegar(1);
    else if (e.key === 'ArrowLeft') navegar(-1);
  };

  return (
    <div className="space-y-3">
      {/* Galeria de fotos */}
      {fotos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {fotos.map((foto) => (
            <div
              key={foto.id}
              className="relative group w-20 h-20 rounded-lg overflow-hidden border bg-muted"
            >
              <DanoFotoImage
                ficheiroUrl={foto.ficheiro_url}
                alt={foto.nome_ficheiro || 'Foto do dano'}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => openLightbox(foto)}
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-white hover:text-white hover:bg-white/20"
                  onClick={() => openLightbox(foto)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {!readonly && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-white hover:text-primary hover:bg-white/20"
                      onClick={() =>
                        setEditingDescricao({ id: foto.id, descricao: foto.descricao || '' })
                      }
                    >
                      <Wrench className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-white hover:text-destructive hover:bg-white/20"
                      onClick={() => handleDelete(foto.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
              {foto.descricao && (
                <div className="absolute top-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 py-0.5 truncate pointer-events-none group-hover:hidden">
                  {foto.descricao}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
          <span>Sem fotos</span>
        </div>
      )}

      {/* Botões de upload */}
      {!readonly && (
        <div className="flex flex-wrap gap-2">
          {uploading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />A enviar...
            </div>
          ) : (
            <>
              {/* Câmera (mobile) */}
              <Label
                htmlFor={`foto-camera-${danoId}`}
                className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium"
              >
                <Camera className="h-4 w-4" />
                Câmera
              </Label>
              <Input
                id={`foto-camera-${danoId}`}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />

              {/* Galeria */}
              <Label
                htmlFor={`foto-upload-${danoId}`}
                className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium"
              >
                <Upload className="h-4 w-4" />
                Galeria
              </Label>
              <Input
                id={`foto-upload-${danoId}`}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </>
          )}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={selectedFoto !== null} onOpenChange={(open) => !open && setSelectedIndex(null)}>
        <DialogContent
          className="fixed inset-0 left-0 top-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-black/95 p-0 text-white sm:rounded-none [&>button]:text-white"
          onKeyDown={handleLightboxKeyDown}
        >
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="text-white">
              {selectedFoto?.nome_ficheiro || 'Foto do Dano'}
              {selectedIndex !== null && fotos.length > 1 && (
                <span className="ml-3 text-sm font-normal text-white/70">
                  {selectedIndex + 1} / {fotos.length}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Visualização ampliada da foto selecionada. Setas para mudar de foto.
            </DialogDescription>
          </DialogHeader>
          {selectedFoto && (
            <div className="relative flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden px-14 pb-4">
              {fotos.length > 1 && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Foto anterior"
                    className="absolute left-2 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full text-white hover:bg-white/20 hover:text-white"
                    onClick={() => navegar(-1)}
                  >
                    <ChevronLeft className="h-8 w-8" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Foto seguinte"
                    className="absolute right-2 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full text-white hover:bg-white/20 hover:text-white"
                    onClick={() => navegar(1)}
                  >
                    <ChevronRight className="h-8 w-8" />
                  </Button>
                </>
              )}
              <DanoFotoImage
                key={selectedFoto.id}
                ficheiroUrl={selectedFoto.ficheiro_url}
                alt={selectedFoto.nome_ficheiro || 'Foto do dano'}
                className="max-h-[80dvh] max-w-full object-contain"
              />
              {selectedFoto.descricao && (
                <p className="w-full max-w-3xl border-t border-white/20 pt-2 text-center italic text-white/80">
                  {selectedFoto.descricao}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Descrição */}
      <Dialog open={!!editingDescricao} onOpenChange={(open) => !open && setEditingDescricao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Legenda da Foto</DialogTitle>
            <DialogDescription className="sr-only">
              Edite a legenda ou descrição da foto do dano.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Legenda / Descrição</Label>
              <Input
                placeholder="Ex: Risco na porta traseira esquerda..."
                value={editingDescricao?.descricao || ''}
                onChange={(e) =>
                  setEditingDescricao((prev) =>
                    prev ? { ...prev, descricao: e.target.value } : null
                  )
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingDescricao(null)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateDescricao} disabled={updating}>
                {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
