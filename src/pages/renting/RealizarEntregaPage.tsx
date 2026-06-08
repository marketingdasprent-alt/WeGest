import { useNavigate, useParams } from 'react-router-dom';
import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ArrowLeft, Camera, CheckCircle2, Loader2, TriangleAlert, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

import { useConsumirTokenRealizacao, useRealizarFromToken } from '@/hooks/useRealizacaoToken';
import { formatMatricula } from '@/components/calendario/calendarioUtils';

interface FilePreview {
  id: string;
  file: File;
  url: string;
}

const RealizarEntregaPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: info, isLoading, error } = useConsumirTokenRealizacao(token ?? null);
  const realizar = useRealizarFromToken();

  const [km, setKm] = useState('');
  const [combustivel, setCombustivel] = useState<string>('');
  const [observacoes, setObservacoes] = useState('');
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleAddFiles = (list: FileList | null) => {
    if (!list) return;
    const novos: FilePreview[] = Array.from(list).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
      url: URL.createObjectURL(f),
    }));
    setFiles((prev) => [...prev, ...novos]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const found = prev.find((f) => f.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleConfirmar = async () => {
    if (!token || !info) return;
    if (!km.trim() || !combustivel) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preenche o km e o nível de combustível.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    // Paths já enviados ao storage — para limpar em caso de falha e não
    // deixar ficheiros órfãos (upload a meio falhou ou o insert rebentou).
    const uploadedPaths: string[] = [];
    try {
      if (files.length > 0) {
        // checkout = entrega ao cliente; checkin = recolha da viatura.
        const mediaTipo = info.tipo === 'entrega' ? 'checkout' : 'checkin';
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id ?? null;
        const registos: {
          contrato_renting_id: string;
          tipo: string;
          url: string;
          nome_ficheiro: string;
          tipo_ficheiro: string;
          tamanho_bytes: number;
          criado_por: string | null;
        }[] = [];

        for (const fp of files) {
          const ext = fp.file.name.split('.').pop() || 'bin';
          const path = `${info.contrato_id}/${info.tipo}/${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('contrato-media')
            .upload(path, fp.file, { contentType: fp.file.type });
          if (upErr) throw upErr;
          uploadedPaths.push(path);
          registos.push({
            contrato_renting_id: info.contrato_id,
            tipo: mediaTipo,
            url: path,
            nome_ficheiro: fp.file.name,
            tipo_ficheiro: fp.file.type,
            tamanho_bytes: fp.file.size,
            criado_por: userId,
          });
        }

        // Regista as fotos na BD (FK para contratos_renting via XOR).
        const { error: insErr } = await supabase.from('contrato_media').insert(registos);
        if (insErr) throw insErr;
      }

      realizar.mutate(
        {
          token,
          eventoId: info.evento_id,
          contratoId: info.contrato_id,
          tipo: info.tipo,
        },
        {
          onSuccess: () => setDone(true),
        }
      );
    } catch (err: unknown) {
      // Limpa ficheiros já enviados para não ficarem órfãos no bucket.
      if (uploadedPaths.length > 0) {
        try {
          await supabase.storage.from('contrato-media').remove(uploadedPaths);
        } catch {
          /* limpeza best-effort — não mascarar o erro original */
        }
      }
      toast({
        title: 'Erro no upload',
        description: err instanceof Error ? err.message : 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Verificar `done` ANTES de error/missing info — após a mutation o token
  // fica `used_at` preenchido e qualquer refetch da RPC consumir_token
  // dá erro. Sem este check, o sucesso seria mascarado pela página de
  // "Token expirado".
  if (done) {
    return (
      <div className="max-w-md mx-auto p-6 mt-12">
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="p-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-600" />
            <h2 className="font-semibold text-lg">
              {info?.tipo === 'entrega' ? 'Entrega' : 'Recolha'} confirmada
            </h2>
            <p className="text-sm text-muted-foreground">
              O evento ficou marcado como realizado. Já podes fechar esta janela.
            </p>
            <Button type="button" onClick={() => navigate('/')} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="max-w-md mx-auto p-6 mt-12">
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-6 text-center space-y-3">
            <TriangleAlert className="h-10 w-10 mx-auto text-destructive" />
            <h2 className="font-semibold text-lg">Token inválido ou expirado</h2>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error
                ? error.message
                : 'Este link já foi usado ou expirou. Pede um novo QR no laptop.'}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.history.back()}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const matricula = formatMatricula(info.matricula);
  const isPending = uploading || realizar.isPending;

  return (
    <div className="max-w-2xl mx-auto">
      <StickyPageHeader
        title={info.tipo === 'entrega' ? 'Realizar Entrega' : 'Realizar Recolha'}
        description={`${matricula}${info.cidade ? ` · ${info.cidade}` : ''} · ${format(
          new Date(info.data_inicio),
          "dd/MM 'às' HH:mm",
          { locale: pt }
        )}`}
        icon={CheckCircle2}
      >
        <Button type="button" onClick={handleConfirmar} disabled={isPending} className="gap-2">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Confirmar
        </Button>
      </StickyPageHeader>

      <div className="p-4 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="km">
                KM Actual <span className="text-red-500">*</span>
              </Label>
              <Input
                id="km"
                type="number"
                inputMode="numeric"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                placeholder="Ex: 45120"
              />
            </div>

            <div className="space-y-2">
              <Label>
                Combustível <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-5 gap-2">
                {['Reserva', '1/4', '1/2', '3/4', 'Cheio'].map((nivel) => (
                  <button
                    key={nivel}
                    type="button"
                    onClick={() => setCombustivel(nivel)}
                    className={`rounded-md border-2 py-2 text-sm font-medium transition-colors ${
                      combustivel === nivel
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    {nivel}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                placeholder="Ex: pequeno risco no para-choques direito"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <Label>Fotos / Vídeos</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => cameraInputRef.current?.click()}
                className="gap-2"
              >
                <Camera className="h-4 w-4" />
                Câmara
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Ficheiros
              </Button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                hidden
                onChange={(e) => handleAddFiles(e.target.files)}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                onChange={(e) => handleAddFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {files.map((f) => (
                  <div key={f.id} className="relative group">
                    <img
                      src={f.url}
                      alt={f.file.name}
                      className="w-full h-24 object-cover rounded border"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(f.id)}
                      className="absolute top-1 right-1 bg-destructive text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RealizarEntregaPage;
