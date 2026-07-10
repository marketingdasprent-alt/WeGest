import { useEffect, useState, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Save,
  Loader2,
  Upload,
  FileText,
  Eye,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FolderUp,
  Lock,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  getCategoriaBadgeClass,
  getStatusBadgeClass,
  getStatusLabel,
  getStatusColorClass,
  deriveViaturaEstado,
} from '@/lib/viaturas';
import { useViaturasOcupacao } from '@/hooks/useViaturasOcupacao';

const viaturaSchema = z.object({
  matricula: z
    .string()
    .min(1, 'Matrícula é obrigatória')
    .regex(/^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}$/, 'Formato inválido. Use XX-00-XX'),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  marca_id: z.string().min(1, 'Marca é obrigatória'),
  modelo_id: z.string().min(1, 'Modelo é obrigatório'),
  combustivel_id: z.string().optional(),
  ano: z.string().optional(),
  cor: z.string().optional(),
  categoria: z.string().optional(),
  combustivel: z.string().optional(),
  status: z.string().optional(),
  km_atual: z.string().optional(),
  numero_motor: z.string().optional(),
  numero_chassis: z.string().optional(),
  data_matricula: z.string().optional(),
  observacoes: z.string().optional(),
  grupo_id: z.string().optional(),
  is_slot: z.boolean().default(false),
  habilitada_tvde: z.boolean().default(false),
  estacao_id: z.string().optional(),
  extintor_numero: z.string().optional(),
  extintor_validade: z.string().optional(),
  tipo_id: z.string().optional(),
});

type ViaturaFormData = z.infer<typeof viaturaSchema>;

interface Viatura {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  marca_id?: string | null;
  modelo_id?: string | null;
  combustivel_id?: string | null;
  ano?: number | null;
  cor?: string | null;
  categoria?: string | null;
  combustivel?: string | null;
  status?: string | null;
  km_atual?: number | null;
  numero_motor?: string | null;
  numero_chassis?: string | null;
  data_matricula?: string | null;
  observacoes?: string | null;
  grupo_id?: string | null;
  is_slot?: boolean | null;
  habilitada_tvde?: boolean | null;
  estacao_id?: string | null;
  extintor_numero?: string | null;
  extintor_validade?: string | null;
  tipo_id?: string | null;
}

interface ViaturaDocument {
  id: string;
  tipo_documento: string;
  nome_ficheiro: string | null;
  ficheiro_url: string;
  data_validade: string | null;
}

interface ViaturaTabDadosProps {
  viatura: Viatura | null;
  isNew: boolean;
  onSave: (data: Partial<Viatura>) => Promise<boolean>;
  saving: boolean;
}

const CATEGORIAS = [
  { value: 'green', label: 'Green' },
  { value: 'comfort', label: 'Comfort' },
  { value: 'black', label: 'Black' },
  { value: 'x-saver', label: 'X-Saver' },
];

interface ViaturaMarca {
  id: string;
  nome: string;
}
interface ViaturaModelo {
  id: string;
  nome: string;
  marca_id: string;
}
interface ViaturaCombustivel {
  id: string;
  nome: string;
}

const STATUS_OPTIONS = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'em_uso', label: 'Em Uso' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'inativo', label: 'Inativo' },
];

const DOCUMENTOS_VIATURA = [
  { tipo: 'dua_frente', label: 'DUA - Frente', obrigatorio: true },
  { tipo: 'dua_verso', label: 'DUA - Verso', obrigatorio: true },
  { tipo: 'dav', label: 'DAV - Declaração Aduaneira de Veículo', obrigatorio: false },
  { tipo: 'ac', label: 'AC - Certificado de Aprovação', obrigatorio: false },
  { tipo: 'ipo', label: 'IPO - Inspeção Periódica Obrigatória', obrigatorio: true },
];

// Mapeamento de prefixo de ficheiro → tipo de documento de viatura
const BATCH_VIATURA_PREFIX_MAP: Record<string, string> = {
  DUAF: 'dua_frente',
  DUAV: 'dua_verso',
  IPO: 'ipo',
  DAV: 'dav',
  AC: 'ac',
  CV: 'carta_verde',
};

function detectViaturaTipoFromFilename(filename: string): string {
  const base = filename.split('.')[0].toUpperCase();
  const prefixes = Object.keys(BATCH_VIATURA_PREFIX_MAP).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (
      base === prefix ||
      base.startsWith(prefix + '_') ||
      base.startsWith(prefix + '-') ||
      base.startsWith(prefix + ' ')
    ) {
      return BATCH_VIATURA_PREFIX_MAP[prefix];
    }
  }
  return '';
}

interface BatchViaturaEntry {
  file: File;
  tipoDetectado: string;
  labelDetectado: string;
  reconhecido: boolean;
}

interface Estacao {
  id: string;
  nome: string;
  cidade: string | null;
}

interface ViaturasTipo {
  id: string;
  nome: string;
  elegivel_tvde?: boolean;
}

interface RentingGrupo {
  id: string;
  nome: string;
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
  // O dirty é um *guard*, não um *gatilho*. Se entrasse nas deps do efeito, o
  // `form.reset(data)` do onSubmit (dirty: true -> false) voltava a disparar a
  // hidratação e reescrevia o formulário a partir da `viatura` do pai — que nesse
  // instante ainda podia ser a versão pré-gravação (modelo_id antigo/vazio).
  const isFormDirtyRef = useRef(isFormDirty);
  isFormDirtyRef.current = isFormDirty;

  // Sincroniza o formulário com a viatura. É reaplicado à medida que as listas de
  // opções (marcas, modelos, combustíveis, tipos, grupos, estações) carregam,
  // porque os <Select> ligados aos IDs (marca_id, modelo_id, …) só mostram o valor
  // guardado se a respetiva <SelectItem> já estiver montada quando o valor é
  // definido. Sem isto, ao reentrar numa viatura os dropdowns apareciam vazios
  // (as opções chegavam depois do reset). O guard isFormDirty evita sobrepor
  // edições do utilizador ainda por guardar.
  useEffect(() => {
    if (!viatura || isFormDirtyRef.current) return;
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
  }, [viatura, form, viaturasTipos, marcas, modelos, combustiveis, grupos, estacoes]);

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
    // Ignora respostas fora de ordem: se a marca mudar antes desta query voltar,
    // a lista antiga não pode sobrepor-se à nova.
    let cancelado = false;
    supabase
      .from('viatura_modelos')
      .select('id, nome, marca_id')
      .eq('marca_id', watchedMarcaId)
      .eq('ativo', true)
      .order('nome')
      .then(
        ({ data }) => {
          if (!cancelado) setModelos(data || []);
        },
        (err) => console.error('Erro ao carregar modelos:', err)
      );
    return () => {
      cancelado = true;
    };
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
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Identificação */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Identificação</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="matricula"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Matrícula <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="AA-00-BB"
                            className="uppercase"
                            value={field.value}
                            onChange={(e) => {
                              // Remove everything except alphanumeric, auto-insert dashes
                              const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                              let formatted = raw;
                              if (raw.length > 4)
                                formatted =
                                  raw.slice(0, 2) + '-' + raw.slice(2, 4) + '-' + raw.slice(4, 6);
                              else if (raw.length > 2)
                                formatted = raw.slice(0, 2) + '-' + raw.slice(2);
                              field.onChange(formatted);
                            }}
                            onBlur={field.onBlur}
                            maxLength={8}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        {estadoDerivedado && estadoDerivedado !== 'disponivel' ? (
                          <div className="flex items-center gap-2.5 py-1.5">
                            <Badge
                              className={`${getStatusBadgeClass(estadoDerivedado)} whitespace-nowrap px-2.5 py-0.5 text-xs font-medium`}
                            >
                              {getStatusLabel(estadoDerivedado)}
                            </Badge>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                              <Lock className="h-3 w-3 shrink-0" />
                              gerido automaticamente
                            </span>
                          </div>
                        ) : (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger
                                className={`font-medium transition-all ${getStatusColorClass(field.value)}`}
                              >
                                <SelectValue placeholder="Selecionar estado" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="disponivel">Disponível</SelectItem>
                              <SelectItem value="inativo">Inativo</SelectItem>
                              <SelectItem
                                value="manutencao"
                                disabled={field.value !== 'manutencao'}
                              >
                                Manutenção{field.value !== 'manutencao' && ' (Automático)'}
                              </SelectItem>
                              <SelectItem value="vendida" disabled={field.value !== 'vendida'}>
                                Vendida{field.value !== 'vendida' && ' (Apenas via Financeiro)'}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="data_matricula"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data da Matrícula</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Veículo */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Veículo</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="marca_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Marca <span className="text-red-500">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={(v) => {
                            field.onChange(v);
                            // Limpar modelo quando muda a marca
                            form.setValue('modelo_id', '', { shouldDirty: true });
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecionar marca" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {marcas.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="modelo_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Modelo <span className="text-red-500">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!watchedMarcaId}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  watchedMarcaId
                                    ? 'Selecionar modelo'
                                    : 'Selecione a marca primeiro'
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {modelos.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ano"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ano</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="2024" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor</FormLabel>
                        <FormControl>
                          <Input placeholder="Branco" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="combustivel_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Combustível</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecionar" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {combustiveis.map((comb) => (
                              <SelectItem key={comb.id} value={comb.id}>
                                {comb.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tipo_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo</FormLabel>
                        <Select
                          value={field.value || ''}
                          onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecionar tipo..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">— Sem tipo —</SelectItem>
                            {viaturasTipos.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {(() => {
                    const tipoId = form.watch('tipo_id');
                    const tipo = viaturasTipos.find((t) => t.id === tipoId);
                    if (!tipo?.elegivel_tvde) return null;
                    return (
                      <FormField
                        control={form.control}
                        name="categoria"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Categoria</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecionar" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {CATEGORIAS.map((cat) => (
                                  <SelectItem key={cat.value} value={cat.value}>
                                    {cat.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    );
                  })()}
                  <FormField
                    control={form.control}
                    name="grupo_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grupo</FormLabel>
                        <Select
                          value={field.value || ''}
                          onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecionar grupo..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">— Sem grupo —</SelectItem>
                            {grupos.map((g) => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Tarifas do grupo — leitura apenas */}
                  {(() => {
                    const grupoId = form.watch('grupo_id');
                    if (!grupoId) return null;
                    const tarifas = allTarifas.filter((t) => t.grupo_id === grupoId);
                    if (tarifas.length === 0) return null;
                    const fmt = (v: number | null) =>
                      v != null
                        ? new Intl.NumberFormat('pt-PT', {
                            style: 'currency',
                            currency: 'EUR',
                          }).format(v)
                        : '—';
                    return (
                      <div className="md:col-span-3 rounded-lg border bg-muted/20 p-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                          Tarifas do Grupo
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {tarifas.map((t) => (
                            <div key={t.nome} className="space-y-1">
                              <p className="text-xs text-muted-foreground">{t.nome}</p>
                              {t.preco_dia != null && (
                                <p className="text-sm font-medium">
                                  {fmt(t.preco_dia)}{' '}
                                  <span className="text-xs text-muted-foreground">/dia</span>
                                </p>
                              )}
                              {t.preco_semana != null && (
                                <p className="text-sm font-semibold text-primary">
                                  {fmt(t.preco_semana)}{' '}
                                  <span className="text-xs text-muted-foreground">/semana</span>
                                </p>
                              )}
                              {t.preco_mes != null && (
                                <p className="text-sm font-medium">
                                  {fmt(t.preco_mes)}{' '}
                                  <span className="text-xs text-muted-foreground">/mês</span>
                                </p>
                              )}
                              {t.kms_incluidos != null && (
                                <p className="text-xs text-muted-foreground">
                                  {t.kms_incluidos} km incl.
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <FormField
                    control={form.control}
                    name="estacao_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estação</FormLabel>
                        <Select
                          value={field.value || ''}
                          onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecionar estação..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">— Sem estação —</SelectItem>
                            {estacoes.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.nome}
                                {e.cidade ? ` (${e.cidade})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Cards TVDE — só visíveis para tipos elegíveis a TVDE */}
                {(() => {
                  const tipoId = form.watch('tipo_id');
                  const tipo = viaturasTipos.find((t) => t.id === tipoId);
                  if (!tipo?.elegivel_tvde) return null;
                  return (
                    <div className="md:col-span-3 mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                        <div>
                          <p className="font-medium">Elegível para TVDE?</p>
                          <Badge variant={form.watch('habilitada_tvde') ? 'default' : 'secondary'}>
                            {form.watch('habilitada_tvde') ? 'Sim' : 'Não'}
                          </Badge>
                        </div>
                        <Switch
                          checked={form.watch('habilitada_tvde')}
                          onCheckedChange={(checked) => form.setValue('habilitada_tvde', checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                        <div>
                          <p className="font-medium">Viatura SLOT</p>
                          <Badge variant={form.watch('is_slot') ? 'default' : 'secondary'}>
                            {form.watch('is_slot') ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <Switch
                          checked={form.watch('is_slot')}
                          onCheckedChange={(checked) => form.setValue('is_slot', checked)}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>

              <Separator />

              {/* Técnico */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Dados Técnicos</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="numero_motor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nº Motor</FormLabel>
                        <FormControl>
                          <Input placeholder="Número do motor" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="numero_chassis"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nº Chassis (VIN)</FormLabel>
                        <FormControl>
                          <Input placeholder="Número do chassis" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="km_atual"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Km Atual</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Segurança / Extintor */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-4">
                  Segurança / Extintor
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="extintor_numero"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nº Extintor</FormLabel>
                        <FormControl>
                          <Input placeholder="Série ou identificação do extintor" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="extintor_validade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Validade Extintor</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

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

      {/* Documentos da Viatura */}
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
                onChange={handleBatchSelect}
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
                          onClick={() => handleViewDocument(existingDoc)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDeleteDocument(existingDoc)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
                          if (file) handleUploadDocument(doc.tipo, file);
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

      {/* Dialog de carregamento em lote */}
      <Dialog
        open={batchDialogOpen}
        onOpenChange={(open) => {
          if (!batchUploading) setBatchDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderUp className="h-5 w-5" />
              Carregar Documentos em Lote
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[400px] overflow-y-auto">
            {batchEntries.map((entry, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 border rounded-lg ${
                  entry.reconhecido ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}
              >
                <FileText
                  className={`h-5 w-5 shrink-0 ${entry.reconhecido ? 'text-green-600' : 'text-red-400'}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.file.name}</p>
                  <p className={`text-xs ${entry.reconhecido ? 'text-green-600' : 'text-red-500'}`}>
                    {entry.reconhecido
                      ? `→ ${entry.labelDetectado}`
                      : 'Tipo não reconhecido — será ignorado'}
                  </p>
                </div>
                {entry.reconhecido && (
                  <Badge
                    variant="outline"
                    className="text-xs shrink-0 border-green-300 text-green-700"
                  >
                    {entry.labelDetectado}
                  </Badge>
                )}
              </div>
            ))}
          </div>
          {batchEntries.some((e) => !e.reconhecido) && (
            <p className="text-xs text-muted-foreground">
              Prefixos reconhecidos: DUAF, DUAV, IPO, DAV, AC, CV
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setBatchDialogOpen(false)}
              disabled={batchUploading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleBatchUpload}
              disabled={batchUploading || !batchEntries.some((e) => e.reconhecido)}
            >
              {batchUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />A carregar...
                </>
              ) : (
                `Carregar ${batchEntries.filter((e) => e.reconhecido).length} ficheiro(s)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
