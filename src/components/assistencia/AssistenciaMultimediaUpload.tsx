import React, { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Camera, Video, X, CheckCircle2, AlertCircle, Loader2, Plus } from 'lucide-react';

interface MediaFile {
  id: string;
  url: string;
  path: string;
  type: 'image' | 'video';
}

interface AssistenciaMultimediaUploadProps {
  onComplete?: (files: MediaFile[]) => void;
  onFilesChange?: (files: MediaFile[]) => void;
  requiredPhotos?: number;
  requiredVideos?: number;
  initialFiles?: MediaFile[];
}

export function AssistenciaMultimediaUpload({
  onComplete,
  onFilesChange,
  requiredPhotos = 1,
  requiredVideos = 0,
  initialFiles,
}: AssistenciaMultimediaUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [files, setFiles] = useState<MediaFile[]>(initialFiles ?? []);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Notificar mudanças
  React.useEffect(() => {
    if (onFilesChange) {
      onFilesChange(files);
    }
  }, [files, onFilesChange]);

  // Estados para o Modo Câmara Mobile
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null); // Para o Lightbox
  const [isContinuousMode, setIsContinuousMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null); // Input específico para câmara
  const videoInputRef = useRef<HTMLInputElement>(null);

  const photos = files.filter((f) => f.type === 'image');
  const videos = files.filter((f) => f.type === 'video');

  const canComplete = photos.length >= requiredPhotos && videos.length >= requiredVideos;

  // Iniciar captura de foto (Câmara)
  const startCamera = () => {
    setIsContinuousMode(true);
    cameraInputRef.current?.click();
  };

  // Lidar com a foto tirada (antes do upload)
  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setPreviewFile(file);
    setPreviewUrl(url);
  };

  // Confirmar e Upload
  const confirmAndUpload = async (next: boolean = false) => {
    if (!previewFile || !user) return;

    const fileToUpload = previewFile;
    const type = fileToUpload.type.startsWith('video') ? 'video' : ('image' as any);

    // Limpar preview imediatamente para dar feedback de velocidade
    setPreviewFile(null);
    setPreviewUrl(null);

    // Se quiser tirar próxima, já abre a câmara enquanto o upload corre em background
    if (next) {
      setTimeout(() => {
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        cameraInputRef.current?.click();
      }, 100);
    } else {
      setIsContinuousMode(false);
    }

    try {
      const fileExt = fileToUpload.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `assistencia/${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('assistencia-anexos')
        .upload(filePath, fileToUpload);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('assistencia-anexos').getPublicUrl(filePath);

      setFiles((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          url: publicUrl,
          path: filePath,
          type,
        },
      ]);

      toast({ title: 'Foto guardada', duration: 1000 });
    } catch (error) {
      console.error('Erro no upload:', error);
      toast({ title: 'Erro ao guardar foto', variant: 'destructive' });
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0 || !user) return;

    setUploading(true);
    setProgress(0);

    const totalFiles = selectedFiles.length;
    let completedFiles = 0;

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        // Validação simples de tamanho (100MB para vídeos, 5MB para fotos)
        const maxSize = type === 'video' ? 100 * 1024 * 1024 : 5 * 1024 * 1024;
        if (file.size > maxSize) {
          toast({
            title: 'Ficheiro muito grande',
            description: `O ficheiro ${file.name} excede o limite de ${type === 'video' ? '100MB' : '5MB'}.`,
            variant: 'destructive',
          });
          continue;
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `assistencia/${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('assistencia-anexos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from('assistencia-anexos').getPublicUrl(filePath);

        setFiles((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7),
            url: publicUrl,
            path: filePath,
            type,
          },
        ]);

        completedFiles++;
        setProgress((completedFiles / totalFiles) * 100);
      }
    } catch (error: any) {
      console.error('Erro no upload:', error);
      toast({ title: 'Erro no upload', variant: 'destructive' });
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeFile = async (file: MediaFile) => {
    try {
      await supabase.storage.from('assistencia-anexos').remove([file.path]);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (error) {
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* LIGHTBOX (VISUALIZAR FOTO GRANDE) */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex flex-col items-center justify-center">
            <button className="absolute top-0 right-0 p-4 text-white hover:text-red-500 transition-colors">
              <X className="h-8 w-8" />
            </button>
            <img
              src={selectedImage}
              alt="Viatura Full"
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="text-white/50 text-xs mt-4 font-mono">Toque fora para fechar</p>
          </div>
        </div>
      )}

      {/* OVERLAY DE PREVIEW (MODO CÂMARA) */}
      {previewUrl && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-md aspect-[3/4] bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
            <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
            <div className="absolute top-4 left-4">
              <span className="bg-black/50 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold border border-white/20 uppercase tracking-widest">
                Confirmar Foto {photos.length + 1}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 w-full max-w-md mt-8">
            <button
              onClick={() => {
                setPreviewFile(null);
                setPreviewUrl(null);
                if (cameraInputRef.current) cameraInputRef.current.value = '';
                cameraInputRef.current?.click();
              }}
              className="flex flex-col items-center gap-2 text-white group"
            >
              <div className="h-14 w-14 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/50 group-active:scale-95 transition-transform">
                <X className="h-6 w-6 text-red-500" />
              </div>
              <span className="text-[10px] font-bold uppercase opacity-70">Repetir</span>
            </button>

            <button
              onClick={() => confirmAndUpload(true)}
              className="flex flex-col items-center gap-2 text-white group"
            >
              <div className="h-20 w-20 rounded-full bg-blue-600 flex items-center justify-center border-4 border-white/20 shadow-xl group-active:scale-95 transition-transform">
                <Plus className="h-8 w-8 text-white" />
              </div>
              <span className="text-xs font-black uppercase tracking-tighter text-center">
                PRÓXIMA FOTO
              </span>
            </button>

            <button
              onClick={() => confirmAndUpload(false)}
              className="flex flex-col items-center gap-2 text-white group"
            >
              <div className="h-14 w-14 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/50 group-active:scale-95 transition-transform">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <span className="text-[10px] font-bold uppercase opacity-70">Concluir</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Photos Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Camera className="h-5 w-5 text-blue-500" />
              Fotografias ({photos.length} carregadas)
            </h3>
            {photos.length < requiredPhotos && (
              <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-1 rounded-md border border-amber-500/20 font-bold">
                Mínimo 4
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {/* Botão de Câmara (Grande destaque no mobile) */}
            <button
              onClick={startCamera}
              disabled={uploading}
              className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-blue-500/50 bg-blue-500/5 rounded-xl hover:bg-blue-500/10 transition-all active:scale-95 shadow-sm p-1"
            >
              <Camera className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 mb-1" />
              <span className="text-[9px] sm:text-[10px] font-black text-blue-700 uppercase leading-tight text-center">
                Tirar
                <br />
                Foto
              </span>
            </button>

            {photos.map((file) => (
              <div
                key={file.id}
                className="relative group aspect-square rounded-xl overflow-hidden border shadow-sm bg-muted"
              >
                <img
                  src={file.url}
                  alt="Viatura"
                  className="h-full w-full object-cover cursor-zoom-in hover:scale-105 transition-transform"
                  onClick={() => setSelectedImage(file.url)}
                />
                <button
                  onClick={() => removeFile(file)}
                  className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full hover:bg-red-500 transition-colors z-10"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded-xl hover:bg-accent transition-all active:scale-95"
            >
              <Plus className="h-6 w-6 text-muted-foreground" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Galeria</span>
            </button>
          </div>
        </div>

        {/* Video Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Video className="h-5 w-5 text-purple-500" />
            Vídeo (~1 minuto)
          </h3>

          <div className="space-y-3">
            {videos.map((file) => (
              <div
                key={file.id}
                className="relative group rounded-xl overflow-hidden border bg-muted p-3 flex items-center gap-3"
              >
                <div className="h-10 w-10 bg-purple-500/10 rounded-full flex items-center justify-center">
                  <Video className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">Vídeo de Inspeção</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    Carregado
                  </p>
                </div>
                <button
                  onClick={() => removeFile(file)}
                  className="p-2 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            {videos.length < requiredVideos && (
              <button
                onClick={() => videoInputRef.current?.click()}
                disabled={uploading}
                className="w-full h-20 sm:h-24 flex flex-col items-center justify-center border-2 border-dashed border-purple-500/50 bg-purple-500/5 rounded-xl hover:bg-purple-500/10 transition-all active:scale-95 px-2"
              >
                <Video className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600 mb-1" />
                <span className="text-xs sm:text-sm font-black text-purple-700 uppercase text-center">
                  Gravar Vídeo (~1 minuto)
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {uploading && (
        <div className="bg-blue-600/5 border border-blue-200 p-3 rounded-xl space-y-2">
          <div className="flex justify-between items-center text-[10px] font-black text-blue-700 uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />A enviar para o servidor...
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-1.5 bg-blue-100" />
        </div>
      )}

      <div className="pt-2">
        <Button
          onClick={() => onComplete?.(files)}
          disabled={!canComplete || uploading}
          size="lg"
          className={`w-full h-14 text-base font-black uppercase tracking-wider transition-all shadow-lg ${canComplete ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-200 text-slate-400'}`}
        >
          {canComplete ? (
            <>
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Confirmar Documentação
            </>
          ) : (
            'Faltam fotos/vídeo obrigatórios'
          )}
        </Button>
      </div>

      {/* INPUTS ESCONDIDOS */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraCapture}
      />
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept="image/*"
        onChange={(e) => handleUpload(e, 'image')}
        className="hidden"
      />
      <input
        type="file"
        ref={videoInputRef}
        accept="video/*"
        capture="environment"
        onChange={(e) => handleUpload(e, 'video')}
        className="hidden"
      />
    </div>
  );
}
