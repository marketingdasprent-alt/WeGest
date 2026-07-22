import { useState, useEffect, useRef, useCallback } from 'react';
import { format, differenceInDays } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  FileText,
  Upload,
  Download,
  Eye,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Trash2,
  Files,
  ShieldCheck,
  Clock,
  PackageOpen,
  ArrowRight,
  Sparkles,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { SectionCard } from '@/components/ui/section-card';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { Motorista } from '@/pages/Motoristas';

interface MotoristDocumento {
  id: string;
  tipo_documento: string;
  nome_ficheiro: string | null;
  ficheiro_url: string;
  data_validade: string | null;
  observacoes: string | null;
  created_at: string;
}

const TIPOS_DOCUMENTO = [
  {
    value: 'documento_identificacao',
    label: 'Cartão Cidadão / Passaporte (Frente)',
    field: 'documento_ficheiro_url',
    validityField: 'documento_validade',
    storageFolder: 'documentos',
  },
  {
    value: 'documento_identificacao_verso',
    label: 'Cartão Cidadão / Passaporte (Verso)',
    field: 'documento_identificacao_verso_url',
    validityField: 'documento_validade',
    storageFolder: 'documentos',
  },
  {
    value: 'carta_conducao',
    label: 'Carta Condução (Frente)',
    field: 'carta_ficheiro_url',
    validityField: 'carta_validade',
    storageFolder: 'cartas',
  },
  {
    value: 'carta_conducao_verso',
    label: 'Carta Condução (Verso)',
    field: 'carta_conducao_verso_url',
    validityField: 'carta_validade',
    storageFolder: 'cartas',
  },
  {
    value: 'licenca_tvde',
    label: 'Licença TVDE',
    field: 'licenca_tvde_ficheiro_url',
    validityField: 'licenca_tvde_validade',
    storageFolder: 'tvde',
  },
  {
    value: 'registo_criminal',
    label: 'Registo Criminal',
    field: 'registo_criminal_url',
    storageFolder: 'documentos',
  },
  {
    value: 'comprovativo_morada',
    label: 'Comprovativo Morada',
    field: 'comprovativo_morada_url',
    storageFolder: 'documentos',
  },
  {
    value: 'comprovativo_iban',
    label: 'Comprovativo IBAN',
    field: 'comprovativo_iban_url',
    storageFolder: 'documentos',
  },
  { value: 'outros', label: 'Outros Documentos', storageFolder: 'documentos' },
];

// Tipos que criam movimento financeiro em vez de documento
const FINANCIAL_TIPOS = ['sinal', 'caucao'] as const;
type FinancialTipo = (typeof FINANCIAL_TIPOS)[number];
const FINANCIAL_META: Record<FinancialTipo, { label: string; categoria: string }> = {
  sinal: { label: 'Sinal', categoria: 'outro' },
  caucao: { label: 'Caução / Depósito', categoria: 'caucao' },
};

// Mapeamento de prefixo de ficheiro → tipo de documento
// Prefixos mais longos são verificados primeiro (LTVDE antes de L, CIBAN antes de C)
const BATCH_PREFIX_MAP: Record<string, string> = {
  LTVDE: 'licenca_tvde',
  CIBAN: 'comprovativo_iban',
  DPST: 'caucao',
  IDF: 'documento_identificacao',
  IDV: 'documento_identificacao_verso',
  CCF: 'carta_conducao',
  CCV: 'carta_conducao_verso',
  RC: 'registo_criminal',
  CM: 'comprovativo_morada',
  SNL: 'sinal',
};

function detectTipoFromFilename(filename: string): string {
  const base = filename.split('.')[0].toUpperCase();
  // Ordena por comprimento decrescente para evitar que "CM" case com "CIBAN"
  const prefixes = Object.keys(BATCH_PREFIX_MAP).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (
      base === prefix ||
      base.startsWith(prefix + '_') ||
      base.startsWith(prefix + '-') ||
      base.startsWith(prefix + ' ')
    ) {
      return BATCH_PREFIX_MAP[prefix];
    }
  }
  return 'outros';
}

// Verifica se um tipo de documento tem campo de validade
function tipoTemValidade(tipoValue: string): boolean {
  const tipoDef = TIPOS_DOCUMENTO.find((t) => t.value === tipoValue);
  return !!(tipoDef as any)?.validityField || tipoValue === 'registo_criminal';
}

interface BatchFileEntry {
  file: File;
  tipoDetectado: string;
  labelDetectado: string;
  reconhecido: boolean;
  isFinanceiro: boolean;
  valor: string; // apenas para tipos financeiros
  validade: string; // data de validade (YYYY-MM-DD) para tipos com validade
}

interface MotoristaTabDocumentosProps {
  motorista: Motorista;
  onMotoristaUpdated?: () => void;
}

export function MotoristaTabDocumentos({
  motorista,
  onMotoristaUpdated,
}: MotoristaTabDocumentosProps) {
  const { user } = useAuth();
  const [documentos, setDocumentos] = useState<MotoristDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentoToDelete, setDocumentoToDelete] = useState<MotoristDocumento | null>(null);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Dialog de validade no upload individual
  const [pendingUpload, setPendingUpload] = useState<{ tipo: string; file: File } | null>(null);
  const [pendingValidade, setPendingValidade] = useState('');

  // Batch upload
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const [batchEntries, setBatchEntries] = useState<BatchFileEntry[]>([]);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchUploading, setBatchUploading] = useState(false);
  const [reextractingTipo, setReextractingTipo] = useState<string | null>(null);

  useEffect(() => {
    loadDocumentos();
  }, [motorista.id]);

  const loadDocumentos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('motorista_documentos')
        .select('*')
        .eq('motorista_id', motorista.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocumentos(data || []);
    } catch (error) {
      console.error('Erro ao carregar documentos:', error);
      toast.error('Erro ao carregar documentos');
    } finally {
      setLoading(false);
    }
  };

  const getDocumentoByTipo = (tipoValue: string, field?: string) => {
    // Primeiro tenta buscar nos campos oficiais do motorista
    if (field && (motorista as any)[field]) {
      return {
        id: field,
        tipo_documento: tipoValue,
        ficheiro_url: (motorista as any)[field],
        nome_ficheiro: `${tipoValue.replace(/_/g, ' ').toUpperCase()}`,
        data_validade: null,
        observacoes: null,
        created_at: motorista.created_at || new Date().toISOString(),
        is_official: true,
      };
    }

    // Se não encontrar no motorista, busca na tabela de documentos extras
    const extra = documentos.find((d) => d.tipo_documento === tipoValue);
    if (extra) return { ...extra, is_official: false };

    return undefined;
  };

  const getValidadeStatus = (dataValidade: string | null) => {
    if (!dataValidade) return { status: 'sem_validade', label: 'Sem validade', color: 'secondary' };

    const diasRestantes = differenceInDays(new Date(dataValidade), new Date());

    if (diasRestantes < 0) {
      return { status: 'expirado', label: 'Expirado', color: 'destructive' };
    } else if (diasRestantes <= 30) {
      return { status: 'expirando', label: `${diasRestantes}d restantes`, color: 'warning' };
    } else {
      return {
        status: 'valido',
        label: format(new Date(dataValidade), 'dd/MM/yyyy'),
        color: 'default',
      };
    }
  };

  const handleUpload = async (tipo: string, file: File, dataValidade?: string) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ficheiro muito grande. Máximo: 10MB');
      return;
    }

    setUploading(tipo);

    try {
      if (!user) throw new Error('Utilizador não autenticado');

      const fileExt = file.name.split('.').pop();
      const tipoDef = TIPOS_DOCUMENTO.find((t) => t.value === tipo);
      const storageFolder = tipoDef?.storageFolder || 'documentos';

      // Mimetizar EXACTAMENTE o DocumentUploader.tsx (usando user.id para evitar RLS)
      const filePath = `${user.id}/${storageFolder}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('motorista-documentos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Erro no Storage:', uploadError);
        throw new Error(`Erro no servidor de ficheiros: ${uploadError.message}`);
      }

      // Se for um tipo que mapeia para um campo oficial, atualiza o motorista
      if (tipoDef?.field) {
        const { error: updateMotoristaError } = await supabase
          .from('motoristas_ativos')
          .update({ [tipoDef.field]: filePath } as TablesUpdate<'motoristas_ativos'>)
          .eq('id', motorista.id);

        if (updateMotoristaError) {
          console.error('Erro ao atualizar motorista:', updateMotoristaError);
          throw new Error(`Erro na base de dados: ${updateMotoristaError.message}`);
        }
        // Guardar validade se fornecida
        if (dataValidade && tipoDef.validityField) {
          await supabase
            .from('motoristas_ativos')
            .update({ [tipoDef.validityField]: dataValidade } as TablesUpdate<'motoristas_ativos'>)
            .eq('id', motorista.id);
        }
        toast.success(`${tipoDef.label} atualizado com sucesso!`);
      } else {
        // Tipos extras guardados em motorista_documentos
        // Caso contrário, trata como documento extra na tabela secundária
        const existente = documentos.find((d) => d.tipo_documento === tipo);

        if (existente) {
          const { error: updateError } = await supabase
            .from('motorista_documentos')
            .update({
              ficheiro_url: filePath,
              nome_ficheiro: file.name,
              updated_at: new Date().toISOString(),
              ...(dataValidade ? { data_validade: dataValidade } : {}),
            })
            .eq('id', existente.id);

          if (updateError) throw updateError;
          await supabase.storage.from('motorista-documentos').remove([existente.ficheiro_url]);
        } else {
          const { error: insertError } = await supabase.from('motorista_documentos').insert({
            motorista_id: motorista.id,
            tipo_documento: tipo,
            ficheiro_url: filePath,
            nome_ficheiro: file.name,
            ...(dataValidade ? { data_validade: dataValidade } : {}),
          });

          if (insertError) throw insertError;
        }
        toast.success('Documento extra carregado com sucesso!');
        // Tentar extração de validade por IA para tipos que têm data de validade
        const TIPOS_COM_VALIDADE_EXTRA = ['registo_criminal'];
        if (TIPOS_COM_VALIDADE_EXTRA.includes(tipo)) {
          void extractAndConfirmValidade(filePath, file.type || '', null, tipo);
        }
      }

      loadDocumentos();
      if (onMotoristaUpdated) onMotoristaUpdated();
    } catch (error: any) {
      console.error('Erro ao carregar documento:', error);
      toast.error(`Erro ao carregar documento: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setUploading(null);
    }
  };

  const handleDownload = async (documento: MotoristDocumento) => {
    try {
      const { data, error } = await supabase.storage
        .from('motorista-documentos')
        .download(documento.ficheiro_url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = documento.nome_ficheiro || 'documento';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao fazer download:', error);
      toast.error('Erro ao fazer download do documento');
    }
  };

  const handleView = async (documento: MotoristDocumento) => {
    try {
      const { data, error } = await supabase.storage
        .from('motorista-documentos')
        .createSignedUrl(documento.ficheiro_url, 3600);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Erro ao visualizar documento:', error);
      toast.error('Erro ao abrir documento');
    }
  };

  const handleDelete = async () => {
    if (!documentoToDelete) return;

    try {
      // Se for oficial, limpa o campo na tabela principal
      const tipoDef = TIPOS_DOCUMENTO.find((t) => t.value === documentoToDelete.tipo_documento);
      if (tipoDef?.field) {
        const { error: updateMotoristaError } = await supabase
          .from('motoristas_ativos')
          .update({ [tipoDef.field]: null } as TablesUpdate<'motoristas_ativos'>)
          .eq('id', motorista.id);

        if (updateMotoristaError) throw updateMotoristaError;
      } else {
        // Se for extra, remove da tabela secundária
        const { error } = await supabase
          .from('motorista_documentos')
          .delete()
          .eq('id', documentoToDelete.id);

        if (error) throw error;
      }

      // Em ambos os casos, tenta remover o ficheiro do storage
      await supabase.storage.from('motorista-documentos').remove([documentoToDelete.ficheiro_url]);

      toast.success('Documento removido com sucesso!');
      loadDocumentos();
      if (onMotoristaUpdated) onMotoristaUpdated();
    } catch (error) {
      console.error('Erro ao remover documento:', error);
      toast.error('Erro ao remover documento');
    } finally {
      setDeleteDialogOpen(false);
      setDocumentoToDelete(null);
    }
  };

  const triggerFileInput = (tipo: string) => {
    fileInputRefs.current[tipo]?.click();
  };

  const handleReextractValidade = async (tipo: (typeof TIPOS_DOCUMENTO)[number]) => {
    const documento = getDocumentoByTipo(tipo.value, tipo.field);
    if (!documento) return;

    const filePath = documento.ficheiro_url;
    // Inferir mimeType pela extensão
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';

    setReextractingTipo(tipo.value);
    try {
      await extractAndConfirmValidade(
        filePath,
        mimeType,
        tipo.validityField ?? null,
        tipo.validityField ? undefined : tipo.value
      );
    } finally {
      setReextractingTipo(null);
    }
  };

  // ── AI: extrai data de validade do documento ──────────────────────────────
  // validityField → guarda em motoristas_ativos (campos oficiais)
  // tipoDocumento → guarda em motorista_documentos.data_validade (RC, etc.)
  const extractAndConfirmValidade = useCallback(
    async (
      filePath: string,
      mimeType: string,
      validityField: string | null,
      tipoDocumento?: string
    ) => {
      try {
        const { data, error } = await supabase.functions.invoke('extract-document-expiry', {
          body: { filePath, mimeType },
        });
        if (error || !data?.date) return;

        const dateFormatted = format(new Date(data.date), 'dd/MM/yyyy', { locale: pt });

        toast(`🤖 Validade detetada: ${dateFormatted}`, {
          description: 'A IA identificou uma data de validade. Deseja aplicar?',
          duration: 20000,
          action: {
            label: 'Aplicar',
            onClick: async () => {
              let updErr = null;
              if (validityField) {
                // Campo oficial em motoristas_ativos
                const { error: e } = await supabase
                  .from('motoristas_ativos')
                  .update({ [validityField]: data.date } as TablesUpdate<'motoristas_ativos'>)
                  .eq('id', motorista.id);
                updErr = e;
              } else if (tipoDocumento) {
                // Guarda em motorista_documentos.data_validade
                const { error: e } = await supabase
                  .from('motorista_documentos')
                  .update({ data_validade: data.date })
                  .eq('motorista_id', motorista.id)
                  .eq('tipo_documento', tipoDocumento);
                updErr = e;
              }
              if (updErr) {
                toast.error('Erro ao guardar a validade');
              } else {
                toast.success('Validade atualizada automaticamente!');
                loadDocumentos();
                if (onMotoristaUpdated) onMotoristaUpdated();
              }
            },
          },
        });
      } catch {
        // silently ignore — AI extraction is best-effort
      }
    },
    [motorista.id, onMotoristaUpdated, loadDocumentos]
  );

  const handleBatchSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const entries: BatchFileEntry[] = files.map((file) => {
      const tipo = detectTipoFromFilename(file.name);
      const isFinanceiro = (FINANCIAL_TIPOS as readonly string[]).includes(tipo);
      const tipoDef = TIPOS_DOCUMENTO.find((t) => t.value === tipo);
      const labelDetectado = isFinanceiro
        ? FINANCIAL_META[tipo as FinancialTipo].label
        : (tipoDef?.label ?? 'Outros Documentos');
      return {
        file,
        tipoDetectado: tipo,
        labelDetectado,
        reconhecido: tipo !== 'outros',
        isFinanceiro,
        valor: '',
        validade: '',
      };
    });
    setBatchEntries(entries);
    setBatchDialogOpen(true);
    e.target.value = '';
  };

  const handleBatchUpload = async () => {
    if (!user) return;

    // Validar que todos os financeiros têm valor
    const financeiros = batchEntries.filter((e) => e.isFinanceiro);
    for (const f of financeiros) {
      const v = parseFloat(f.valor.replace(',', '.'));
      if (!f.valor.trim() || isNaN(v) || v <= 0) {
        toast.error(`Introduz o valor para "${f.labelDetectado}" antes de continuar.`);
        return;
      }
    }

    setBatchUploading(true);

    for (const entry of batchEntries) {
      if (entry.isFinanceiro) {
        // Upload do ficheiro para storage
        try {
          const fileExt = entry.file.name.split('.').pop();
          const filePath = `${user.id}/documentos/${Date.now()}.${fileExt}`;
          const { error: upErr } = await supabase.storage
            .from('motorista-documentos')
            .upload(filePath, entry.file, { cacheControl: '3600', upsert: false });
          if (upErr) throw upErr;

          const meta = FINANCIAL_META[entry.tipoDetectado as FinancialTipo];
          const valor = parseFloat(entry.valor.replace(',', '.'));
          const { error: finErr } = await supabase.from('motorista_financeiro').insert({
            motorista_id: motorista.id,
            tipo: 'credito',
            categoria: meta.categoria,
            descricao: meta.label,
            valor,
            data_movimento: new Date().toISOString().split('T')[0],
            referencia: filePath,
            status: 'pendente',
          });
          if (finErr) throw finErr;
          toast.success(`${meta.label} adicionado ao Financeiro (${valor.toFixed(2)} €)`);
        } catch (err: any) {
          toast.error(`Erro ao processar "${entry.file.name}": ${err.message}`);
        }
      } else {
        await handleUpload(entry.tipoDetectado, entry.file, entry.validade || undefined);
      }
    }

    setBatchUploading(false);
    setBatchDialogOpen(false);
    setBatchEntries([]);
  };

  // Stats calculations — 'outros' é bucket livre (extra), não documento obrigatório.
  const tiposObrigatorios = TIPOS_DOCUMENTO.filter((t) => t.value !== 'outros');
  const totalTipos = tiposObrigatorios.length;
  const anexados = tiposObrigatorios.filter((t) => getDocumentoByTipo(t.value, t.field)).length;
  const emFalta = totalTipos - anexados;
  const aExpirar = documentos.filter((d) => {
    if (!d.data_validade) return false;
    const dias = differenceInDays(new Date(d.data_validade), new Date());
    return dias >= 0 && dias <= 30;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">A carregar documentos...</div>
      </div>
    );
  }

  const statsCards = [
    {
      title: 'Total',
      value: totalTipos,
      icon: Files,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Anexados',
      value: anexados,
      icon: ShieldCheck,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Em Falta',
      value: emFalta,
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
    {
      title: 'A Expirar',
      value: aExpirar,
      icon: Clock,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statsCards.map((card) => (
          <Card key={card.title} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Documents Table in SectionCard */}
      <SectionCard
        icon={<FileText className="h-4 w-4" />}
        title="Documentos do Motorista"
        headerClassName="bg-blue-50 dark:bg-blue-950/30"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            Documentos próximos do vencimento serão destacados.
          </p>
          <div className="flex gap-2">
            <input
              ref={batchInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleBatchSelect}
            />
            <Button variant="outline" size="sm" onClick={() => batchInputRef.current?.click()}>
              <PackageOpen className="h-4 w-4 mr-2" />
              Carregar em Lote
            </Button>
            <Button variant="outline" size="sm" onClick={loadDocumentos}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              <TableHead>Ficheiro</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TIPOS_DOCUMENTO.map((tipo) => {
              const documento = getDocumentoByTipo(tipo.value, tipo.field);

              // Determina a validade com base no campo oficial ou no documento extra
              let dataValidade = documento?.data_validade;
              if (tipo.validityField) {
                dataValidade = (motorista as any)[tipo.validityField];
              }

              const validadeInfo =
                documento || dataValidade ? getValidadeStatus(dataValidade) : null;

              return (
                <TableRow key={tipo.value} className={tipo.field ? 'bg-muted/5' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {tipo.field ? (
                        <ShieldCheck className="h-4 w-4 text-blue-500" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="flex flex-col">
                        <span className="font-medium">{tipo.label}</span>
                        {tipo.field && (
                          <span className="text-[10px] text-blue-600 uppercase font-bold tracking-wider">
                            Documento Oficial
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {documento ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm truncate max-w-[200px]">
                          {documento.nome_ficheiro || 'Ficheiro anexado'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <XCircle className="h-4 w-4" />
                        <span className="text-sm">Não anexado</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {validadeInfo && (
                      <Badge
                        variant={
                          validadeInfo.color === 'warning'
                            ? 'outline'
                            : validadeInfo.color === 'destructive'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className={
                          validadeInfo.color === 'warning'
                            ? 'border-yellow-500 text-yellow-600'
                            : ''
                        }
                      >
                        {validadeInfo.status === 'expirado' && (
                          <AlertTriangle className="h-3 w-3 mr-1" />
                        )}
                        {validadeInfo.label}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <input
                        type="file"
                        ref={(el) => (fileInputRefs.current[tipo.value] = el)}
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(tipo.value, file);
                          e.target.value = '';
                        }}
                      />

                      {documento ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleView(documento)}
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(documento)}
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {(tipo.validityField || tipo.value === 'registo_criminal') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleReextractValidade(tipo)}
                              disabled={reextractingTipo === tipo.value}
                              title="Re-extrair validade com IA"
                              className="text-violet-500 hover:text-violet-600"
                            >
                              {reextractingTipo === tipo.value ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => triggerFileInput(tipo.value)}
                            disabled={uploading === tipo.value}
                            title="Substituir"
                          >
                            <RefreshCw
                              className={`h-4 w-4 ${uploading === tipo.value ? 'animate-spin' : ''}`}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setDocumentoToDelete(documento);
                              setDeleteDialogOpen(true);
                            }}
                            title="Remover"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => triggerFileInput(tipo.value)}
                          disabled={uploading === tipo.value}
                        >
                          {uploading === tipo.value ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />A carregar...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Anexar
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <p className="text-xs text-muted-foreground mt-4">
          Formatos aceites: PDF, JPG, PNG. Tamanho máximo: 10MB.
        </p>
      </SectionCard>

      {/* Dialog de carregamento em lote */}
      <Dialog
        open={batchDialogOpen}
        onOpenChange={(open) => {
          if (!batchUploading) setBatchDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageOpen className="h-5 w-5" />
              Carregar Documentos em Lote
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto py-1">
            {batchEntries.map((entry, i) => (
              <div
                key={i}
                className={`rounded-lg border px-3 py-2 text-sm space-y-2 ${entry.isFinanceiro ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <FileText
                    className={`h-4 w-4 shrink-0 ${entry.isFinanceiro ? 'text-amber-500' : 'text-muted-foreground'}`}
                  />
                  <span className="flex-1 truncate text-muted-foreground" title={entry.file.name}>
                    {entry.file.name}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Badge
                    variant={
                      entry.isFinanceiro ? 'outline' : entry.reconhecido ? 'default' : 'outline'
                    }
                    className={
                      entry.isFinanceiro
                        ? 'shrink-0 border-amber-500 text-amber-600 bg-amber-500/10'
                        : entry.reconhecido
                          ? 'shrink-0 bg-green-600 text-white'
                          : 'shrink-0 text-muted-foreground'
                    }
                  >
                    {entry.isFinanceiro ? `💶 ${entry.labelDetectado}` : entry.labelDetectado}
                  </Badge>
                </div>
                {entry.isFinanceiro && (
                  <div className="flex items-center gap-2 pl-7">
                    <Label className="text-xs text-amber-700 dark:text-amber-400 shrink-0">
                      Valor (€) *
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className="h-7 text-sm w-32"
                      value={entry.valor}
                      onChange={(e) => {
                        setBatchEntries((prev) =>
                          prev.map((item, idx) =>
                            idx === i ? { ...item, valor: e.target.value } : item
                          )
                        );
                      }}
                    />
                  </div>
                )}
                {!entry.isFinanceiro && tipoTemValidade(entry.tipoDetectado) && (
                  <div className="flex items-center gap-2 pl-7">
                    <CalendarDays className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <Label className="text-xs text-blue-700 dark:text-blue-400 shrink-0">
                      Validade
                    </Label>
                    <Input
                      type="date"
                      className="h-7 text-sm w-40"
                      value={entry.validade}
                      onChange={(e) => {
                        setBatchEntries((prev) =>
                          prev.map((item, idx) =>
                            idx === i ? { ...item, validade: e.target.value } : item
                          )
                        );
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          {batchEntries.some((e) => e.isFinanceiro) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Os documentos de Sinal e Caução serão criados como <strong>Crédito</strong> no
              separador Financeiro.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Ficheiros não reconhecidos serão guardados em <strong>Outros Documentos</strong>.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBatchDialogOpen(false)}
              disabled={batchUploading}
            >
              Cancelar
            </Button>
            <Button onClick={handleBatchUpload} disabled={batchUploading}>
              {batchUploading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {batchUploading ? 'A carregar...' : `Carregar ${batchEntries.length} ficheiro(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de validade no upload individual */}
      <Dialog
        open={!!pendingUpload}
        onOpenChange={(open) => {
          if (!open) setPendingUpload(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-500" />
              Data de Validade
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Introduza a data de validade do documento (opcional).
          </p>
          <Input
            type="date"
            value={pendingValidade}
            onChange={(e) => setPendingValidade(e.target.value)}
            className="w-full"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                if (pendingUpload) {
                  handleUpload(pendingUpload.tipo, pendingUpload.file);
                  setPendingUpload(null);
                  setPendingValidade('');
                }
              }}
            >
              Saltar
            </Button>
            <Button
              onClick={() => {
                if (pendingUpload) {
                  handleUpload(
                    pendingUpload.tipo,
                    pendingUpload.file,
                    pendingValidade || undefined
                  );
                  setPendingUpload(null);
                  setPendingValidade('');
                }
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              Carregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de remoção */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Documento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que pretende remover este documento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
