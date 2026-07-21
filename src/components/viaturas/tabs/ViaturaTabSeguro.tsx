import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Save,
  Loader2,
  Upload,
  FileText,
  Eye,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { pt } from 'date-fns/locale';

const seguroSchema = z.object({
  seguro_numero: z.string().optional(),
  seguradora: z.string().optional(),
  seguro_validade: z.string().optional(),
  inspecao_validade: z.string().optional(),
});

type SeguroFormData = z.infer<typeof seguroSchema>;

interface Viatura {
  id: string;
  seguro_numero?: string | null;
  seguradora?: string | null;
  seguro_validade?: string | null;
  inspecao_validade?: string | null;
}

interface ViaturaDocument {
  id: string;
  tipo_documento: string;
  nome_ficheiro: string | null;
  ficheiro_url: string;
  data_validade: string | null;
}

interface ViaturaTabSeguroProps {
  viatura: Viatura | null;
  onUpdate: () => void;
}

export function ViaturaTabSeguro({ viatura, onUpdate }: ViaturaTabSeguroProps) {
  const [saving, setSaving] = useState(false);
  const [cartaVerde, setCartaVerde] = useState<ViaturaDocument | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const form = useForm<SeguroFormData>({
    resolver: zodResolver(seguroSchema),
    defaultValues: {
      seguro_numero: '',
      seguradora: '',
      seguro_validade: '',
      inspecao_validade: '',
    },
  });

  useEffect(() => {
    if (viatura) {
      form.reset({
        seguro_numero: viatura.seguro_numero || '',
        seguradora: viatura.seguradora || '',
        seguro_validade: viatura.seguro_validade || '',
        inspecao_validade: viatura.inspecao_validade || '',
      });
      loadCartaVerde();
    }
  }, [viatura, form]);

  const loadCartaVerde = async () => {
    if (!viatura?.id) return;

    try {
      const { data, error } = await supabase
        .from('viatura_documentos')
        .select('*')
        .eq('viatura_id', viatura.id)
        .eq('tipo_documento', 'carta_verde')
        .maybeSingle();

      if (error) throw error;
      setCartaVerde(data);
    } catch (error) {
      console.error('Erro ao carregar carta verde:', error);
    }
  };

  const onSubmit = async (data: SeguroFormData) => {
    if (!viatura?.id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('viaturas')
        .update({
          seguro_numero: data.seguro_numero || null,
          seguradora: data.seguradora || null,
          seguro_validade: data.seguro_validade || null,
          inspecao_validade: data.inspecao_validade || null,
        })
        .eq('id', viatura.id);

      if (error) throw error;
      toast.success('Dados do seguro atualizados com sucesso!');
      onUpdate();
    } catch (error) {
      console.error('Erro ao atualizar seguro:', error);
      toast.error('Erro ao atualizar dados do seguro');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadCartaVerde = async (file: File) => {
    if (!viatura?.id) return;

    setUploadingDoc(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${viatura.id}/carta_verde_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('viatura-documentos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      if (cartaVerde) {
        const { error } = await supabase
          .from('viatura_documentos')
          .update({
            ficheiro_url: fileName,
            nome_ficheiro: file.name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cartaVerde.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('viatura_documentos').insert({
          viatura_id: viatura.id,
          tipo_documento: 'carta_verde',
          ficheiro_url: fileName,
          nome_ficheiro: file.name,
        });

        if (error) throw error;
      }

      toast.success('Carta Verde anexada com sucesso!');
      loadCartaVerde();
    } catch (error) {
      console.error('Erro ao anexar Carta Verde:', error);
      toast.error('Erro ao anexar Carta Verde');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleViewCartaVerde = async () => {
    if (!cartaVerde) return;

    try {
      const { data, error } = await supabase.storage
        .from('viatura-documentos')
        .createSignedUrl(cartaVerde.ficheiro_url, 60);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Erro ao visualizar Carta Verde:', error);
      toast.error('Erro ao visualizar documento');
    }
  };

  const handleDeleteCartaVerde = async () => {
    if (!cartaVerde) return;
    if (!window.confirm('Tem a certeza que quer remover a Carta Verde?')) return;

    try {
      await supabase.storage.from('viatura-documentos').remove([cartaVerde.ficheiro_url]);

      const { error } = await supabase.from('viatura_documentos').delete().eq('id', cartaVerde.id);

      if (error) throw error;
      toast.success('Carta Verde removida com sucesso!');
      setCartaVerde(null);
    } catch (error) {
      console.error('Erro ao remover Carta Verde:', error);
      toast.error('Erro ao remover documento');
    }
  };

  const getValidityStatus = (date: string | null | undefined) => {
    if (!date) return null;

    const daysUntilExpiry = differenceInDays(new Date(date), new Date());

    if (daysUntilExpiry < 0) {
      return { status: 'expired', label: 'Expirado', color: 'destructive' as const };
    } else if (daysUntilExpiry <= 30) {
      return {
        status: 'expiring',
        label: `Expira em ${daysUntilExpiry} dias`,
        color: 'warning' as const,
      };
    } else {
      return { status: 'valid', label: 'Válido', color: 'success' as const };
    }
  };

  const seguroStatus = getValidityStatus(viatura?.seguro_validade);
  const inspecaoStatus = getValidityStatus(viatura?.inspecao_validade);

  if (!viatura) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Guarde a viatura primeiro para configurar o seguro.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Formulário do Seguro */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Dados do Seguro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="seguradora"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seguradora</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome da seguradora" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="seguro_numero"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nº da Apólice</FormLabel>
                    <FormControl>
                      <Input placeholder="Número da apólice" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="seguro_validade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      Validade do Seguro
                      {seguroStatus && (
                        <Badge
                          variant={
                            seguroStatus.color === 'success'
                              ? 'default'
                              : seguroStatus.color === 'warning'
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {seguroStatus.label}
                        </Badge>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="inspecao_validade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      Validade da Inspeção (IPO)
                      {inspecaoStatus && (
                        <Badge
                          variant={
                            inspecaoStatus.color === 'success'
                              ? 'default'
                              : inspecaoStatus.color === 'warning'
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {inspecaoStatus.label}
                        </Badge>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Carta Verde */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Carta Verde
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-4">
            {cartaVerde ? (
              <>
                <div className="flex items-center justify-center gap-2 text-green-500">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div>
                  <p className="font-medium">Documento anexado</p>
                  <p className="text-sm text-muted-foreground">{cartaVerde.nome_ficheiro}</p>
                </div>
                <div className="flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleViewCartaVerde}>
                    <Eye className="h-4 w-4 mr-2" />
                    Visualizar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={handleDeleteCartaVerde}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remover
                  </Button>
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
                    Anexe a Carta Verde do seguro automóvel
                  </p>
                </div>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadCartaVerde(file);
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
                      Anexar Carta Verde
                    </span>
                  </Button>
                </label>
              </>
            )}
          </div>

          {/* Alertas de Validade */}
          {(seguroStatus?.status === 'expired' ||
            seguroStatus?.status === 'expiring' ||
            inspecaoStatus?.status === 'expired' ||
            inspecaoStatus?.status === 'expiring') && (
            <div className="mt-6 space-y-2">
              {seguroStatus?.status === 'expired' && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>O seguro está expirado!</span>
                </div>
              )}
              {seguroStatus?.status === 'expiring' && (
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 rounded-lg text-yellow-600 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>O seguro {seguroStatus.label.toLowerCase()}</span>
                </div>
              )}
              {inspecaoStatus?.status === 'expired' && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>A inspeção está expirada!</span>
                </div>
              )}
              {inspecaoStatus?.status === 'expiring' && (
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 rounded-lg text-yellow-600 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>A inspeção {inspecaoStatus.label.toLowerCase()}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
