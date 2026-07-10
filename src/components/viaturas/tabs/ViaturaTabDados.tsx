import { useEffect, useState, useRef } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { deriveViaturaEstado } from '@/lib/viaturas';
import { useViaturasOcupacao } from '@/hooks/useViaturasOcupacao';
import {
  viaturaSchema,
  DOCUMENTOS_VIATURA,
  type ViaturaFormData,
  type Viatura,
  type ViaturaDocument,
  type ViaturaMarca,
  type ViaturaModelo,
  type ViaturaCombustivel,
  type Estacao,
  type ViaturasTipo,
  type RentingGrupo,
  type BatchViaturaEntry,
} from './viaturaTabDados.types';
import { detectViaturaTipoFromFilename } from './viaturaBatchDetect';
import { ViaturaFormIdentificacao } from './ViaturaFormIdentificacao';
import { ViaturaFormVeiculo } from './ViaturaFormVeiculo';
import { ViaturaFormTecnico } from './ViaturaFormTecnico';
import { ViaturaFormSeguranca } from './ViaturaFormSeguranca';
import { ViaturaDocumentosCard } from './ViaturaDocumentosCard';
import { ViaturaBatchUploadDialog } from './ViaturaBatchUploadDialog';

interface ViaturaTabDadosProps {
  viatura: Viatura | null;
  isNew: boolean;
  onSave: (data: Partial<Viatura>) => Promise<boolean>;
  saving: boolean;
}

export function ViaturaTabDados({ viatura, isNew, onSave, saving }: ViaturaTabDadosProps) {
  const [documents, setDocuments] = useState<ViaturaDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [estacoes, setEstacoes] = useState<Estacao[]>([]);
  const [viaturasTipos, setViaturasTipos] = useState<ViaturasTipo[]>([]);
  const [grupos, setGrupos] = useState<RentingGrupo[]>([]);
  const [allTarifas, setAllTarifas] = useState<
    Array<{
      grupo_id: string;
      nome: string;
      preco_dia: number | null;
      preco_semana: number | null;
      preco_mes: number | null;
      kms_incluidos: number | null;
    }>
  >([]);
  const [marcas, setMarcas] = useState<ViaturaMarca[]>([]);
  const [modelos, setModelos] = useState<ViaturaModelo[]>([]);
  const [combustiveis, setCombustiveis] = useState<ViaturaCombustivel[]>([]);

  // Estado derivado da viatura (considera ocupações ativas: contrato, reserva, movimento)
  const { data: fontesMap } = useViaturasOcupacao();
  const estadoDerivedado = viatura
    ? deriveViaturaEstado(viatura, fontesMap?.get(viatura.id))
    : null;

  // Batch upload
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const [batchEntries, setBatchEntries] = useState<BatchViaturaEntry[]>([]);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchUploading, setBatchUploading] = useState(false);

  useEffect(() => {
    supabase
      .from('estacoes')
      .select('id, nome, cidade')
      .eq('ativa', true)
      .order('nome')
      .then(
        ({ data }) => setEstacoes(data || []),
        (err) => console.error('Erro ao carregar estações:', err)
      );
    supabase
      .from('viatura_tipos')
      .select('id, nome, elegivel_tvde')
      .eq('ativo', true)
      .order('nome')
      .then(
        ({ data }) => setViaturasTipos(data || []),
        (err) => console.error('Erro ao carregar tipos:', err)
      );
    supabase
      .from('renting_grupos')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')
      .then(
        ({ data }) => setGrupos(data || []),
        (err) => console.error('Erro ao carregar grupos:', err)
      );
    supabase
      .from('renting_tarifas')
      .select('grupo_id, nome, preco_dia, preco_semana, preco_mes, kms_incluidos')
      .eq('ativa', true)
      .then(
        ({ data }) => setAllTarifas((data as any) || []),
        (err) => console.error('Erro ao carregar tarifas:', err)
      );
    supabase
      .from('viatura_marcas')
      .select('id, nome')
      .eq('ativa', true)
      .order('nome')
      .then(
        ({ data }) => setMarcas(data || []),
        (err) => console.error('Erro ao carregar marcas:', err)
      );
    supabase
      .from('viatura_combustiveis')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')
      .then(
        ({ data }) => setCombustiveis(data || []),
        (err) => console.error('Erro ao carregar combustíveis:', err)
      );
  }, []);

  const form = useForm<ViaturaFormData>({
    resolver: zodResolver(viaturaSchema),
    defaultValues: {
      matricula: '',
      marca: '',
      modelo: '',
      marca_id: '',
      modelo_id: '',
      combustivel_id: '',
      ano: '',
      cor: '',
      categoria: '',
      combustivel: '',
      status: 'disponivel',
      km_atual: '',
      numero_motor: '',
      numero_chassis: '',
      data_matricula: '',
      observacoes: '',
      grupo_id: '',
      is_slot: false,
      habilitada_tvde: false,
      estacao_id: '',
      extintor_numero: '',
      extintor_validade: '',
      tipo_id: '',
    },
  });

  // Subscrição ao estado dirty (lida em render) para o guard do reset abaixo.
  const isFormDirty = form.formState.isDirty;

  // Sincroniza o formulário com a viatura. É reaplicado à medida que as listas de
  // opções (marcas, modelos, combustíveis, tipos, grupos, estações) carregam,
  // porque os <Select> ligados aos IDs (marca_id, modelo_id, …) só mostram o valor
  // guardado se a respetiva <SelectItem> já estiver montada quando o valor é
  // definido. Sem isto, ao reentrar numa viatura os dropdowns apareciam vazios
  // (as opções chegavam depois do reset). O guard isFormDirty evita sobrepor
  // edições do utilizador ainda por guardar.
  useEffect(() => {
    if (!viatura || isFormDirty) return;
    form.reset({
      matricula: viatura.matricula || '',
      marca: viatura.marca || '',
      modelo: viatura.modelo || '',
      marca_id: viatura.marca_id || '',
      modelo_id: viatura.modelo_id || '',
      combustivel_id: viatura.combustivel_id || '',
      ano: viatura.ano?.toString() || '',
      cor: viatura.cor || '',
      categoria: viatura.categoria || '',
      combustivel: viatura.combustivel || '',
      status: viatura.status === 'em_uso' ? 'disponivel' : viatura.status || 'disponivel',
      km_atual: viatura.km_atual?.toString() || '',
      numero_motor: viatura.numero_motor || '',
      numero_chassis: viatura.numero_chassis || '',
      data_matricula: viatura.data_matricula || '',
      observacoes: viatura.observacoes || '',
      grupo_id: viatura.grupo_id || '',
      is_slot: viatura.is_slot || false,
      habilitada_tvde: viatura.habilitada_tvde || false,
      estacao_id: viatura.estacao_id || '',
      extintor_numero: viatura.extintor_numero || '',
      extintor_validade: viatura.extintor_validade || '',
      tipo_id: viatura.tipo_id || '',
    });
  }, [viatura, form, isFormDirty, viaturasTipos, marcas, modelos, combustiveis, grupos, estacoes]);

  // Documentos: carregar uma vez por viatura.
  useEffect(() => {
    if (viatura?.id) loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viatura?.id]);

  // Fetch modelos when marca_id changes
  const watchedMarcaId = form.watch('marca_id');
  useEffect(() => {
    if (!watchedMarcaId) {
      setModelos([]);
      return;
    }
    supabase
      .from('viatura_modelos')
      .select('id, nome, marca_id')
      .eq('marca_id', watchedMarcaId)
      .eq('ativo', true)
      .order('nome')
      .then(
        ({ data }) => setModelos(data || []),
        (err) => console.error('Erro ao carregar modelos:', err)
      );
  }, [watchedMarcaId]);

  const loadDocuments = async () => {
    if (!viatura?.id) return;

    setLoadingDocs(true);
    try {
      const { data, error } = await supabase
        .from('viatura_documentos')
        .select('*')
        .eq('viatura_id', viatura.id)
        .in(
          'tipo_documento',
          DOCUMENTOS_VIATURA.map((d) => d.tipo)
        );

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Erro ao carregar documentos:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  const onSubmit = async (data: ViaturaFormData) => {
    // Resolve text names from FK IDs
    const marcaNome = marcas.find((m) => m.id === data.marca_id)?.nome || data.marca || '';
    const modeloNome = modelos.find((m) => m.id === data.modelo_id)?.nome || data.modelo || '';
    const combustivelNome =
      combustiveis.find((c) => c.id === data.combustivel_id)?.nome || data.combustivel || '';

    const payload: Partial<Viatura> = {
      matricula: data.matricula.toUpperCase(),
      marca: marcaNome,
      modelo: modeloNome,
      marca_id: data.marca_id || null,
      modelo_id: data.modelo_id || null,
      combustivel_id: data.combustivel_id || null,
      ano: data.ano ? parseInt(data.ano) : null,
      cor: data.cor || null,
      categoria: data.categoria || null,
      combustivel: combustivelNome || null,
      status: data.status || 'disponivel',
      km_atual: data.km_atual ? parseInt(data.km_atual) : 0,
      numero_motor: data.numero_motor || null,
      numero_chassis: data.numero_chassis || null,
      data_matricula: data.data_matricula || null,
      observacoes: data.observacoes || null,
      grupo_id: data.grupo_id || null,
      is_slot: data.is_slot,
      habilitada_tvde: data.habilitada_tvde,
      estacao_id: data.estacao_id || null,
      extintor_numero: data.extintor_numero || null,
      extintor_validade: data.extintor_validade || null,
      tipo_id: data.tipo_id || null,
    };

    const ok = await onSave(payload);
    // Marca os valores atuais como novo baseline "limpo" — sem isto, isFormDirty
    // (usado para desativar o botão Guardar) ficava preso em `true` após gravar,
    // porque a hidratação a partir da `viatura` do pai é ignorada enquanto dirty.
    if (ok) form.reset(data);
  };

  // Sem isto, uma validação falhada (ex.: marca/modelo obrigatórios ainda por
  // escolher) fazia o handleSubmit não chamar o onSubmit E não dar feedback —
  // o utilizador carregava em Guardar e "não acontecia nada". Mostra os campos
  // em falta num toast.
  const onInvalid = (errors: FieldErrors<ViaturaFormData>) => {
    const msgs = Object.values(errors)
      .map((e) => (e && typeof e.message === 'string' ? e.message : null))
      .filter((m): m is string => !!m);
    const unicas = Array.from(new Set(msgs)).slice(0, 5);
    toast.error(
      unicas.length ? unicas.join(' · ') : 'Verifica os campos obrigatórios assinalados a vermelho.'
    );
  };

  const handleUploadDocument = async (tipoDoc: string, file: File) => {
    if (!viatura?.id) {
      toast.error('Guarde a viatura primeiro antes de anexar documentos.');
      return;
    }

    setUploadingDoc(tipoDoc);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${viatura.id}/${tipoDoc}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('viatura-documentos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Check if document already exists
      const existingDoc = documents.find((d) => d.tipo_documento === tipoDoc);

      if (existingDoc) {
        // Update existing
        const { error } = await supabase
          .from('viatura_documentos')
          .update({
            ficheiro_url: fileName,
            nome_ficheiro: file.name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingDoc.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase.from('viatura_documentos').insert({
          viatura_id: viatura.id,
          tipo_documento: tipoDoc,
          ficheiro_url: fileName,
          nome_ficheiro: file.name,
        });

        if (error) throw error;
      }

      toast.success('Documento anexado com sucesso!');
      loadDocuments();
    } catch (error) {
      console.error('Erro ao anexar documento:', error);
      toast.error('Erro ao anexar documento');
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleBatchSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const entries: BatchViaturaEntry[] = files.map((file) => {
      const tipo = detectViaturaTipoFromFilename(file.name);
      const docDef =
        DOCUMENTOS_VIATURA.find((d) => d.tipo === tipo) ||
        (tipo === 'carta_verde' ? { label: 'Carta Verde' } : null);
      return {
        file,
        tipoDetectado: tipo,
        labelDetectado: docDef?.label || 'Não reconhecido',
        reconhecido: !!tipo,
      };
    });

    setBatchEntries(entries);
    setBatchDialogOpen(true);
    // Reset input so the same files can be re-selected
    e.target.value = '';
  };

  const handleBatchUpload = async () => {
    if (!viatura?.id) return;
    const validEntries = batchEntries.filter((e) => e.reconhecido);
    if (validEntries.length === 0) {
      toast.error('Nenhum ficheiro reconhecido para carregar');
      return;
    }

    setBatchUploading(true);
    let successCount = 0;

    for (const entry of validEntries) {
      try {
        const fileExt = entry.file.name.split('.').pop();
        const fileName = `${viatura.id}/${entry.tipoDetectado}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('viatura-documentos')
          .upload(fileName, entry.file);

        if (uploadError) throw uploadError;

        // Check if document already exists (upsert)
        const { data: existing } = await supabase
          .from('viatura_documentos')
          .select('id')
          .eq('viatura_id', viatura.id)
          .eq('tipo_documento', entry.tipoDetectado)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('viatura_documentos')
            .update({
              ficheiro_url: fileName,
              nome_ficheiro: entry.file.name,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('viatura_documentos').insert({
            viatura_id: viatura.id,
            tipo_documento: entry.tipoDetectado,
            ficheiro_url: fileName,
            nome_ficheiro: entry.file.name,
          });
          if (error) throw error;
        }

        successCount++;
      } catch (error) {
        console.error(`Erro ao carregar ${entry.file.name}:`, error);
      }
    }

    setBatchUploading(false);
    setBatchDialogOpen(false);
    setBatchEntries([]);

    if (successCount > 0) {
      toast.success(`${successCount} documento(s) carregado(s) com sucesso!`);
      loadDocuments();
    }
    if (successCount < validEntries.length) {
      toast.error(`${validEntries.length - successCount} ficheiro(s) falharam`);
    }
  };

  const handleViewDocument = async (doc: ViaturaDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('viatura-documentos')
        .createSignedUrl(doc.ficheiro_url, 60);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Erro ao visualizar documento:', error);
      toast.error('Erro ao visualizar documento');
    }
  };

  const handleDeleteDocument = async (doc: ViaturaDocument) => {
    try {
      await supabase.storage.from('viatura-documentos').remove([doc.ficheiro_url]);

      const { error } = await supabase.from('viatura_documentos').delete().eq('id', doc.id);

      if (error) throw error;
      toast.success('Documento removido com sucesso!');
      loadDocuments();
    } catch (error) {
      console.error('Erro ao remover documento:', error);
      toast.error('Erro ao remover documento');
    }
  };

  const getDocumentByType = (tipo: string) => {
    return documents.find((d) => d.tipo_documento === tipo);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Formulário Principal */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Dados da Viatura</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
              <ViaturaFormIdentificacao form={form} estadoDerivedado={estadoDerivedado} />

              <Separator />

              <ViaturaFormVeiculo
                form={form}
                watchedMarcaId={watchedMarcaId}
                marcas={marcas}
                modelos={modelos}
                combustiveis={combustiveis}
                viaturasTipos={viaturasTipos}
                grupos={grupos}
                allTarifas={allTarifas}
                estacoes={estacoes}
              />

              <Separator />

              <ViaturaFormTecnico form={form} />

              <Separator />

              <ViaturaFormSeguranca form={form} />

              <Separator />

              {/* Observações */}
              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Notas adicionais sobre a viatura..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-end gap-3">
                {isFormDirty && !saving && (
                  <span className="text-xs text-muted-foreground">Alterações por gravar</span>
                )}
                <Button type="submit" disabled={saving || !isFormDirty}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {isNew ? 'Criar Viatura' : 'Guardar Alterações'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <ViaturaDocumentosCard
        isNew={isNew}
        batchInputRef={batchInputRef}
        onBatchSelect={handleBatchSelect}
        getDocumentByType={getDocumentByType}
        uploadingDoc={uploadingDoc}
        onUpload={handleUploadDocument}
        onView={handleViewDocument}
        onDelete={handleDeleteDocument}
      />

      <ViaturaBatchUploadDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        batchEntries={batchEntries}
        batchUploading={batchUploading}
        onUpload={handleBatchUpload}
      />
    </div>
  );
}
