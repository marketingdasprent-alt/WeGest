import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { gerarContratoAtomico } from '@/hooks/useContratos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Camera,
  CheckCircle,
  Film,
  Loader2,
  Upload,
  X,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { printPdf } from '@/lib/printPdf';
import { format } from 'date-fns';
import { formatMatricula } from './calendarioUtils';
import type { PendingEventoData } from './NovoEventoPage';
import jsPDF from 'jspdf';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import {
  uploadDocumentToStorage,
  generateDocumentFromTemplate,
} from '@/utils/generateDocumentFromTemplate';
import {
  CheckinDadosSection,
  emptyCheckinDados,
  validateCheckinDados,
  saveCheckinDados,
  gerarFolhaDanos,
} from './CheckinDadosSection';
import type { CheckinDadosState } from './CheckinDadosSection';

export interface ContratoEntregaStepProps {
  eventoData: PendingEventoData;
  onConcluir: () => void;
  onVoltar: () => void;
}

interface SelectedFile {
  id: string;
  file: File;
  preview: string | null;
}

export const ContratoEntregaStep: React.FC<ContratoEntregaStepProps> = ({
  eventoData,
  onConcluir,
  onVoltar,
}) => {
  const {
    motoristaId,
    motoristaNome,
    viaturaId,
    viatura,
    userId,
    data,
    hora,
    diaTodo,
    observacoes,
    estacaoId,
    estacaoNome,
  } = eventoData;
  const fazerDepois = eventoData.fazerDepois ?? false;

  const queryClient = useQueryClient();
  const { empresas } = useClientesEmpresas();
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [dataInicio, setDataInicio] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [cidadeAssinatura, setCidadeAssinatura] = useState('Leiria');
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [checkinDados, setCheckinDados] = useState<CheckinDadosState>(emptyCheckinDados);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [contratoNumero, setContratoNumero] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dragOverRef = useRef<HTMLDivElement>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['doc-templates-entrega'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_templates')
        .select('id, nome, tipo, cliente_empresa_id, empresa_id')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data as {
        id: string;
        nome: string;
        tipo: string;
        cliente_empresa_id: string | null;
        empresa_id: string | null;
      }[];
    },
  });

  const { data: motoristaFull } = useQuery({
    queryKey: ['motorista-full-contrato', motoristaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('motoristas_ativos')
        .select(
          'id, nome, nif, email, telefone, morada, documento_tipo, documento_numero, data_contratacao, cidade'
        )
        .eq('id', motoristaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!motoristaId,
  });

  const { data: danosExistentes = [] } = useQuery({
    queryKey: ['viatura-danos-entrega', viaturaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('viatura_danos')
        .select('id, descricao, localizacao, estado, data_registo')
        .eq('viatura_id', viaturaId)
        .neq('estado', 'reparado')
        .order('data_registo', { ascending: false });
      return data || [];
    },
    enabled: !!viaturaId,
  });

  const toggleTemplate = (id: string) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [
      ...prev,
      ...selected.map((f) => ({
        id: Math.random().toString(36).slice(2),
        file: f,
        preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
      })),
    ]);
    e.target.value = '';
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f?.preview) URL.revokeObjectURL(f.preview);
      return prev.filter((x) => x.id !== id);
    });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === dragOverRef.current) {
      setIsDragging(false);
    }
  };

  const handleDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      const validFiles = Array.from(droppedFiles).filter(
        (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
      );
      if (validFiles.length === 0) {
        toast.error('Por favor, arraste apenas imagens ou vídeos');
        return;
      }
      setFiles((prev) => [
        ...prev,
        ...validFiles.map((f) => ({
          id: Math.random().toString(36).slice(2),
          file: f,
          preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
        })),
      ]);
    }
  };

  const handleConfirm = async () => {
    if (!fazerDepois) {
      if (files.length === 0 && checkinDados.novosDanos.length === 0) {
        toast.error('Adicione pelo menos uma foto/vídeo ou registe um dano com foto');
        return;
      }
      const checkinErr = validateCheckinDados(
        checkinDados,
        viatura.km_atual ?? 0,
        viatura.combustivel ?? ''
      );
      if (checkinErr) {
        toast.error(checkinErr);
        return;
      }
    }

    const empresaId = empresas[0]?.id;
    if (!empresaId) {
      toast.error('Nenhuma empresa configurada');
      return;
    }

    setSaving(true);
    try {
      // 1. Create the calendar event
      const dataISO = diaTodo
        ? new Date(`${data}T00:00:00`).toISOString()
        : new Date(`${data}T${hora}:00`).toISOString();

      const eventoPayload: Record<string, any> = {
        titulo: viatura.matricula.replace(/[-\s]/g, '').toUpperCase(),
        tipo: 'entrega',
        data_inicio: dataISO,
        data_fim: null,
        dia_todo: diaTodo,
        cidade: estacaoNome || null,
        descricao: observacoes.trim() || null,
        criado_por: userId,
        // Entrega imediata = já realizada; "fazer depois" = fica pendente.
        // As listas (Fase 3) leem realizado_em IS NULL, e o contrato fica
        // sempre 'ativo' na entrega — sem isto, entregas imediatas apareceriam
        // como pendentes.
        realizado_em: fazerDepois ? null : dataISO,
        realizado_por_id: fazerDepois ? null : userId,
      };
      if (motoristaId) eventoPayload.motorista_id = motoristaId;

      let evResult = await supabase
        .from('calendario_eventos')
        .insert(eventoPayload)
        .select('id')
        .single();
      if (evResult.error) {
        const { motorista_id: _, ...fallback } = eventoPayload;
        evResult = await supabase.from('calendario_eventos').insert(fallback).select('id').single();
        if (evResult.error) throw evResult.error;
      }
      const eventoId = evResult.data.id;

      // 2. Associar viatura ao motorista
      const { error: mvErr } = await supabase.from('motorista_viaturas').insert({
        motorista_id: motoristaId,
        viatura_id: viaturaId,
        data_inicio: data,
        status: 'ativo',
        observacoes: observacoes.trim() || null,
      });
      if (mvErr) throw mvErr;

      // 3. Viatura → em_uso + estação
      const { error: vErr } = await supabase
        .from('viaturas')
        .update({ status: 'em_uso', estacao_id: estacaoId || null })
        .eq('id', viaturaId);
      if (vErr) throw vErr;

      // 4. Notificação (fire & forget)
      try {
        await supabase.functions.invoke('send-calendar-notification', {
          body: {
            matricula: eventoPayload.titulo,
            cidade: estacaoNome,
            tipo: 'entrega',
            data_inicio: dataISO,
            dia_todo: diaTodo,
          },
        });
      } catch {
        /* non-critical */
      }

      // 5. Insert contrato (via RPC atómica — previne duplicados)
      const ct = await gerarContratoAtomico({
        motoristaId,
        empresaId,
        motoristaNome,
        motoristaNif: motoristaFull?.nif,
        motoristaEmail: motoristaFull?.email,
        motoristaTelefone: motoristaFull?.telefone,
        motoristaMorada: motoristaFull?.morada,
        motoristaDocumentoTipo: motoristaFull?.documento_tipo,
        motoristaDocumentoNumero: motoristaFull?.documento_numero,
        cidadeAssinatura,
        dataAssinatura: dataInicio,
        dataInicio,
        duracaoMeses: 12,
        criadoPor: userId,
        forceNewVersion: true,
        viaturaId,
        calendarioEventoId: eventoId,
      });

      const contratoId = ct.id;
      setContratoNumero(ct.numero_contrato);

      if (!fazerDepois) {
        // 6. KM, combustivel, danos
        await saveCheckinDados({
          dados: checkinDados,
          contratoId,
          viaturaId,
          userId,
          tipo: 'checkout',
          motoristaId,
        });

        // 7. Upload checkout media
        const mediaRecords: any[] = [];
        for (const { file } of files) {
          const ext = file.name.split('.').pop() || 'bin';
          const path = `${contratoId}/checkout/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('contrato-media')
            .upload(path, file, { contentType: file.type });
          if (upErr) throw upErr;
          mediaRecords.push({
            contrato_id: contratoId,
            tipo: 'checkout',
            url: path,
            nome_ficheiro: file.name,
            tipo_ficheiro: file.type,
            tamanho_bytes: file.size,
            criado_por: userId,
          });
        }
        const { error: mediaErr } = await supabase.from('contrato_media').insert(mediaRecords);
        if (mediaErr) throw mediaErr;
      }

      // Generate selected documents (mesma lógica do GenerateDocumentsDialog)
      if (selectedTemplates.size > 0 && motoristaFull) {
        const empresa = empresas[0];
        const docData = {
          data_assinatura: dataInicio,
          data_inicio: dataInicio,
          cidade_assinatura: cidadeAssinatura,
          duracao_meses: 12,
          empresaData: empresa
            ? {
                nomeCompleto: empresa.nomeCompleto,
                nif: empresa.nif,
                sede: empresa.sede,
                licencaTVDE: empresa.licencaTVDE,
                licencaValidade: empresa.licencaValidade,
                representante: empresa.representante,
                cargoRepresentante: empresa.cargoRepresentante,
              }
            : undefined,
        };

        const templateIds = Array.from(selectedTemplates);
        const isMultiple = templateIds.length > 1;
        const combinedPdf = isMultiple
          ? new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
          : null;

        // Upload do primeiro template ao storage
        let firstDocUrl: string | null = null;
        let successCount = 0;
        for (const templateId of templateIds) {
          try {
            if (!firstDocUrl) {
              firstDocUrl =
                (await uploadDocumentToStorage({
                  templateId,
                  motoristaData: motoristaFull,
                  documentData: docData,
                  contratoId,
                })) || null;
            }

            await generateDocumentFromTemplate({
              templateId,
              motoristaData: motoristaFull,
              documentData: docData,
              action: 'print',
              skipOutput: isMultiple,
              existingPdf: combinedPdf || undefined,
            });
            successCount++;
          } catch {
            /* PDF non-critical */
          }
        }

        // Upload URL do primeiro documento
        if (firstDocUrl) {
          await supabase
            .from('contratos')
            .update({ documento_url: firstDocUrl })
            .eq('id', contratoId);
        }

        // Adicionar folha de danos ao PDF (existentes + novos)
        if (danosExistentes.length > 0 || checkinDados.novosDanos.length > 0) {
          const targetPdf = isMultiple && combinedPdf ? combinedPdf : undefined;
          gerarFolhaDanos({
            matricula: viatura.matricula,
            motoristaNome,
            tipo: 'checkout',
            tipoCombustivel: viatura.combustivel ?? '',
            km: checkinDados.km,
            combustivel: checkinDados.combustivel,
            nivelEletrico: checkinDados.nivelEletrico,
            nivelGpl: checkinDados.nivelGpl,
            danosExistentes,
            novosDanos: checkinDados.novosDanos,
            dataEvento: dataInicio,
            contratoNumero: ct.numero_contrato,
            existingPdf: targetPdf,
          });
          if (targetPdf) successCount++;
        }

        // Imprimir PDF combinado quando múltiplos documentos
        if (isMultiple && combinedPdf && successCount > 0) {
          combinedPdf.deletePage(1);
          const fileName = `Documentos_CT-${String(ct.numero_contrato ?? 0).padStart(4, '0')}.pdf`;
          printPdf(combinedPdf, fileName);
        }
      }

      // 8. Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['calendario-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['viaturas-calendario'] });
      queryClient.invalidateQueries({ queryKey: ['viaturas-pendentes-recolha'] });
      queryClient.invalidateQueries({ queryKey: ['motorista-viaturas'] });
      if (fazerDepois) {
        queryClient.invalidateQueries({ queryKey: ['contratos-checkout-pendentes'] });
      }

      toast.success(
        fazerDepois
          ? `CT-${String(ct.numero_contrato ?? 0).padStart(4, '0')} criado — check-out pendente`
          : `Contrato CT-${String(ct.numero_contrato ?? 0).padStart(4, '0')} criado`
      );
      setDone(true);
      setTimeout(() => onConcluir(), 1500);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar contrato');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4">
        <CheckCircle className="h-16 w-16 text-green-500" />
        <p className="text-xl font-semibold">Contrato criado!</p>
        {contratoNumero != null && (
          <Badge variant="outline" className="font-mono text-base px-3 py-1">
            CT-{String(contratoNumero).padStart(4, '0')}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-card shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onVoltar}
          className="shrink-0"
          disabled={saving}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold leading-tight">Criar Contrato de Prestação</h1>
          <p className="text-xs text-muted-foreground truncate">
            {motoristaNome} — {formatMatricula(viatura.matricula)}
          </p>
        </div>
        <Button onClick={handleConfirm} disabled={saving} className="shrink-0">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />A criar...
            </>
          ) : (
            'Confirmar'
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-4 text-sm text-green-700 dark:text-green-300">
            <p className="font-medium">Entrega pronta para registar.</p>
            <p className="mt-0.5 opacity-80">
              {fazerDepois
                ? 'O km, combustível, danos e fotos serão preenchidos mais tarde no Check-out Pendente.'
                : 'Preencha os dados e adicione fotos de checkout para confirmar.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Data de Início do Contrato</Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade de Assinatura</Label>
              <Input
                value={cidadeAssinatura}
                onChange={(e) => setCidadeAssinatura(e.target.value)}
                placeholder="Ex: Leiria"
              />
            </div>
          </div>

          {templates.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Documentos{' '}
                <span className="text-muted-foreground font-normal text-xs">
                  (serão impressos ao confirmar)
                </span>
              </Label>
              <div className="rounded-lg border border-border divide-y divide-border">
                {templates.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <Checkbox
                      checked={selectedTemplates.has(t.id)}
                      onCheckedChange={() => toggleTemplate(t.id)}
                    />
                    <span className="text-sm">{t.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {!fazerDepois && (
            <>
              <CheckinDadosSection
                viaturaId={viaturaId}
                kmMinimo={viatura.km_atual ?? 0}
                dados={checkinDados}
                onChange={setCheckinDados}
                tipo="checkout"
                tipoCombustivel={viatura.combustivel ?? ''}
                motoristaNome={motoristaNome}
                matricula={formatMatricula(viatura.matricula)}
                dataEvento={dataInicio}
                contratoNumero={contratoNumero}
                accentClass="border-green-200 dark:border-green-800"
              />

              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  Fotos / Vídeos de Checkout
                  <span className="text-muted-foreground text-xs font-normal ml-1">
                    (obrigatório se sem danos)
                  </span>
                </Label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <div
                  ref={dragOverRef}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDropFiles}
                  className={cn(
                    'grid grid-cols-2 gap-2 p-2 rounded-lg transition-colors',
                    isDragging && 'bg-primary/10 border-2 border-primary border-dashed'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className={cn(
                      'rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-colors py-6 flex flex-col items-center gap-2 text-sm text-muted-foreground',
                      isDragging && 'border-primary/50 bg-primary/5'
                    )}
                  >
                    <Camera className="h-6 w-6 opacity-40" />
                    <span>Câmara</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-colors py-6 flex flex-col items-center gap-2 text-sm text-muted-foreground',
                      isDragging && 'border-primary/50 bg-primary/5'
                    )}
                  >
                    <Upload className="h-6 w-6 opacity-40" />
                    <span>Galeria / Ficheiros</span>
                  </button>
                </div>

                {files.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {files.map((f) => (
                      <div
                        key={f.id}
                        className="relative rounded-lg overflow-hidden border border-border aspect-square bg-muted"
                      >
                        {f.preview ? (
                          <img
                            src={f.preview}
                            alt={f.file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center w-full h-full gap-1 p-2">
                            <Film className="h-6 w-6 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground text-center leading-tight truncate w-full">
                              {f.file.name}
                            </span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFile(f.id)}
                          className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-black/80"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Contrato de prestação de serviços com duração de{' '}
            <strong className="text-foreground mx-1">12 meses</strong>. O dashboard irá alertar
            quando estiver próximo de renovar.
          </div>
        </div>
      </div>
    </div>
  );
};
