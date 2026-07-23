import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Upload, FileText, Eye, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Radio, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ViaturaObeDispositivoSection } from './obe/ViaturaObeDispositivoSection';
import { ViaturaObeHistoricoSection } from './obe/ViaturaObeHistoricoSection';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

interface Viatura {
  id: string;
}

interface ViaturaDocument {
  id: string;
  tipo_documento: string;
  nome_ficheiro: string | null;
  ficheiro_url: string;
}

interface ViaturaTabOBEProps {
  viatura: Viatura | null;
  onUpdate: () => void;
}

export function ViaturaTabOBE({ viatura, onUpdate }: ViaturaTabOBEProps) {
  const { canEdit } = usePermissions();
  const podeEditar = canEdit(RECURSOS.VIATURAS_EDITAR);
  const [contratoOBE, setContratoOBE] = useState<ViaturaDocument | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  useEffect(() => {
    if (viatura) loadContratoOBE();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viatura?.id]);

  const loadContratoOBE = async () => {
    if (!viatura?.id) return;
    try {
      const { data, error } = await supabase
        .from('viatura_documentos')
        .select('*')
        .eq('viatura_id', viatura.id)
        .eq('tipo_documento', 'contrato_obe')
        .maybeSingle();
      if (error) throw error;
      setContratoOBE(data);
    } catch (error) {
      console.error('Erro ao carregar contrato OBE:', error);
    }
  };

  const handleUploadContrato = async (file: File) => {
    if (!viatura?.id) return;

    setUploadingDoc(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${viatura.id}/contrato_obe_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('viatura-documentos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      if (contratoOBE) {
        const { error } = await supabase
          .from('viatura_documentos')
          .update({
            ficheiro_url: fileName,
            nome_ficheiro: file.name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contratoOBE.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('viatura_documentos').insert({
          viatura_id: viatura.id,
          tipo_documento: 'contrato_obe',
          ficheiro_url: fileName,
          nome_ficheiro: file.name,
        });

        if (error) throw error;
      }

      toast.success('Contrato OBE anexado com sucesso!');
      loadContratoOBE();
    } catch (error) {
      console.error('Erro ao anexar Contrato OBE:', error);
      toast.error('Erro ao anexar Contrato OBE');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleViewContrato = async () => {
    if (!contratoOBE) return;
    try {
      const { data, error } = await supabase.storage
        .from('viatura-documentos')
        .createSignedUrl(contratoOBE.ficheiro_url, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Erro ao visualizar Contrato OBE:', error);
      toast.error('Erro ao visualizar documento');
    }
  };

  const handleDeleteContrato = async () => {
    if (!contratoOBE || !podeEditar) return;
    if (!window.confirm('Tem a certeza que quer remover o Contrato OBE?')) return;
    try {
      await supabase.storage.from('viatura-documentos').remove([contratoOBE.ficheiro_url]);
      const { error } = await supabase.from('viatura_documentos').delete().eq('id', contratoOBE.id);
      if (error) throw error;
      toast.success('Contrato OBE removido com sucesso!');
      setContratoOBE(null);
    } catch (error) {
      console.error('Erro ao remover Contrato OBE:', error);
      toast.error('Erro ao remover documento');
    }
  };

  if (!viatura) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Guarde a viatura primeiro para configurar o OBE.
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="dispositivo" className="w-full">
      <TabsList>
        <TabsTrigger value="dispositivo">
          <Radio className="h-4 w-4 mr-2" />
          Dispositivo
        </TabsTrigger>
        <TabsTrigger value="historico">
          <History className="h-4 w-4 mr-2" />
          Histórico de Portagens
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dispositivo" className="mt-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <ViaturaObeDispositivoSection viaturaId={viatura.id} onChanged={onUpdate} />

          {/* Contrato OBE */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Contrato OBE
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-4">
                {contratoOBE ? (
                  <>
                    <div className="flex items-center justify-center gap-2 text-green-500">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="font-medium">Documento anexado</p>
                      <p className="text-sm text-muted-foreground">{contratoOBE.nome_ficheiro}</p>
                    </div>
                    <div className="flex justify-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleViewContrato}>
                        <Eye className="h-4 w-4 mr-2" />
                        Visualizar
                      </Button>
                      {podeEditar && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={handleDeleteContrato}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remover
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center">
                      <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Nenhum documento anexado</p>
                      <p className="text-sm text-muted-foreground">
                        Anexe o contrato do dispositivo OBE
                      </p>
                    </div>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadContrato(file);
                        }}
                        disabled={uploadingDoc}
                      />
                      <Button variant="outline" asChild disabled={uploadingDoc}>
                        <span>
                          {uploadingDoc ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          Anexar Contrato OBE
                        </span>
                      </Button>
                    </label>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="historico" className="mt-6">
        <ViaturaObeHistoricoSection viaturaId={viatura.id} />
      </TabsContent>
    </Tabs>
  );
}
