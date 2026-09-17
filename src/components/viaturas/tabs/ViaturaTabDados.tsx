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
  useViaturaMarcas,
  useViaturaModelos,
  useViaturaCombustiveis,
  useViaturaTipos,
  useViaturaGrupos,
  useViaturaEstacoes,
  useViaturaTarifas,
  useViaturaTarifasTvdeModelo,
  useViaturaTarifasRacModelo,
} from '@/hooks/useViaturaCatalogos';
import {
  viaturaSchema,
  viaturaSchemaNova,
  resumoErrosViatura,
  DOCUMENTOS_VIATURA,
  type ViaturaFormData,
  type Viatura,
  type ViaturaDocument,
  type BatchViaturaEntry,
} from './viaturaTabDados.types';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirmacao } from '@/hooks/useConfirmacao';
import { RECURSOS } from '@/utils/permissions';
import { viaturaToFormValues, VIATURA_FK_FIELDS } from './viaturaFormValues';
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
  const { canEdit, hasAccessToResource } = usePermissions();
  const { confirmar, dialogo } = useConfirmacao();
  const podeEditar = canEdit(RECURSOS.VIATURAS_EDITAR);
  const podeAlterarEstadoInativo = hasAccessToResource(RECURSOS.VIATURAS_ALTERAR_ESTADO);
  const [documents, setDocuments] = useState<ViaturaDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const { data: fontesMap } = useViaturasOcupacao();
  const estadoDerivedado = viatura
    ? deriveViaturaEstado(viatura, fontesMap?.get(viatura.id))
    : null;

  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const [batchEntries, setBatchEntries] = useState<BatchViaturaEntry[]>([]);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchUploading, setBatchUploading] = useState(false);

  const form = useForm<ViaturaFormData>({
    // O tipo é obrigatório só em viaturas novas para não bloquear registos
    // antigos em produção que ainda não o têm.
    resolver: zodResolver(isNew ? viaturaSchemaNova : viaturaSchema),
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
      proxima_manutencao_data: '',
      proxima_manutencao_km: '',
    },
  });

  const watchedMarcaId = form.watch('marca_id');
  const marcas = useViaturaMarcas();
  const modelos = useViaturaModelos(watchedMarcaId);
  const combustiveis = useViaturaCombustiveis();
  const viaturasTipos = useViaturaTipos();
  const grupos = useViaturaGrupos();
  const estacoes = useViaturaEstacoes();
  const allTarifas = useViaturaTarifas();
  const tarifasTvdeModelo = useViaturaTarifasTvdeModelo();
  const tarifasRacModelo = useViaturaTarifasRacModelo();

  const isFormDirty = form.formState.isDirty;

  // Os Selects por FK só aceitam opções já montadas. Reaplica cada valor quando
  // o catálogo chega sem substituir campos que o utilizador já editou.
  const viaturaIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!viatura) return;

    if (viaturaIdRef.current !== viatura.id) {
      viaturaIdRef.current = viatura.id;
      form.reset(viaturaToFormValues(viatura));
    }

    const valores = viaturaToFormValues(viatura);
    for (const name of VIATURA_FK_FIELDS) {
      const alvo = valores[name];
      const atual = form.getValues(name);
      // Recupera Selects antes de a opção montar, sem substituir uma edição do utilizador.
      if (atual !== alvo && (!form.getFieldState(name).isDirty || (!atual && alvo))) {
        form.setValue(name, alvo, { shouldDirty: false });
      }
    }
  }, [viatura, form, viaturasTipos, marcas, modelos, combustiveis, grupos, estacoes]);

  useEffect(() => {
    if (viatura?.id) loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viatura?.id]);

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
    // Mantém o texto guardado quando um catálogo não resolve a FK, incluindo
    // modelos ainda a carregar e opções inativas.
    const marcaNome =
      marcas.find((m) => m.id === data.marca_id)?.nome || data.marca || viatura?.marca || '';
    const modeloNome =
      modelos.find((m) => m.id === data.modelo_id)?.nome || data.modelo || viatura?.modelo || '';
    const combustivelNome =
      combustiveis.find((c) => c.id === data.combustivel_id)?.nome ||
      data.combustivel ||
      viatura?.combustivel ||
      '';

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
      proxima_manutencao_data: data.proxima_manutencao_data || null,
      proxima_manutencao_km: data.proxima_manutencao_km
        ? parseInt(data.proxima_manutencao_km)
        : null,
    };

    const ok = await onSave(payload);
    // Actualiza o baseline para o botão Guardar não ficar dirty após gravar.
    if (ok) form.reset(data);
  };

  // Dá feedback quando react-hook-form bloqueia o submit por validação.
  const onInvalid = (errors: FieldErrors<ViaturaFormData>) => {
    const resumo = resumoErrosViatura(errors);
    toast.error(resumo || 'Verifica os campos obrigatórios assinalados a vermelho.');
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

      const existingDoc = documents.find((d) => d.tipo_documento === tipoDoc);

      if (existingDoc) {
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
    if (!podeEditar) return;
    const ok = await confirmar({
      titulo: 'Remover este documento?',
      descricao: 'O ficheiro é apagado do armazenamento e não pode ser recuperado.',
      acao: 'Remover',
      destrutiva: true,
    });
    if (!ok) return;

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
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Dados da Viatura</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
              <ViaturaFormIdentificacao
                form={form}
                estadoDerivedado={estadoDerivedado}
                podeAlterarEstadoInativo={podeAlterarEstadoInativo}
              />

              <Separator />

              <ViaturaFormVeiculo
                form={form}
                tipoObrigatorio={isNew}
                watchedMarcaId={watchedMarcaId}
                marcas={marcas}
                modelos={modelos}
                combustiveis={combustiveis}
                viaturasTipos={viaturasTipos}
                grupos={grupos}
                allTarifas={allTarifas}
                tarifasTvdeModelo={tarifasTvdeModelo}
                tarifasRacModelo={tarifasRacModelo}
                estacoes={estacoes}
                viaturaId={viatura?.id ?? null}
              />

              <Separator />

              <ViaturaFormTecnico form={form} />

              <Separator />

              <ViaturaFormSeguranca form={form} />

              <Separator />

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
        podeEliminar={podeEditar}
      />

      <ViaturaBatchUploadDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        batchEntries={batchEntries}
        batchUploading={batchUploading}
        onUpload={handleBatchUpload}
      />
      {dialogo}
    </div>
  );
}
