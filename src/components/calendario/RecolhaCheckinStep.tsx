import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nivelEnergia } from '@/utils/combustivel';
import { useRascunho } from '@/hooks/useRascunho';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Camera,
  CheckCircle,
  FileSignature,
  Film,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMatricula } from './calendarioUtils';
import type { PendingEventoData } from './NovoEventoPage';
import {
  CheckinDadosSection,
  emptyCheckinDados,
  validateCheckinDados,
  saveCheckinDados,
  reidratarCheckinDados,
} from './CheckinDadosSection';
import { generateDocumentFromTemplate } from '@/utils/generateDocumentFromTemplate';
import { emailFolhaDanos } from '@/lib/emailFolhaDanos';
import type { CheckinDadosState } from './CheckinDadosSection';
import { useOrgId } from '@/contexts/TenantContext';
import {
  AssinaturasHandoverSection,
  type AssinaturasHandoverHandle,
} from '@/components/assinatura/AssinaturasHandoverSection';
import { papeisEmFalta } from '@/utils/assinaturasHandover';
import { useGuardarAssinaturasHandover } from '@/hooks/useAssinaturasHandover';
import { useAuth } from '@/contexts/AuthContext';

export interface RecolhaCheckinStepProps {
  eventoData: PendingEventoData;
  onConcluir: () => void;
  onVoltar: () => void;
}

interface SelectedFile {
  id: string;
  file: File;
  preview: string | null;
}

export const RecolhaCheckinStep: React.FC<RecolhaCheckinStepProps> = ({
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
  const orgId = useOrgId();
  const { user } = useAuth();
  const guardarAssinaturas = useGuardarAssinaturasHandover();
  const assinaturasRef = useRef<AssinaturasHandoverHandle>(null);
  const responsavelNome =
    (user?.user_metadata?.nome as string | undefined) ?? user?.email ?? 'Responsável';

  const queryClient = useQueryClient();
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [checkinDados, setCheckinDados] = useState<CheckinDadosState>(emptyCheckinDados);

  // Um refresh a meio de uma folha de danos apagava km, descrições e — o que
  // custa mesmo — as fotos já tiradas. Guarda por viatura, nunca global.
  const { limpar: limparRascunho } = useRascunho({
    chave: viaturaId ? `folha-recolha-${viaturaId}` : null,
    valor: checkinDados,
    restaurar: (d) => setCheckinDados(reidratarCheckinDados(d)),
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dragOverRef = useRef<HTMLDivElement>(null);

  const isDevolucao = eventoData.tipo === 'devolucao';

  const { data: contrato, isLoading: loadingContrato } = useQuery({
    queryKey: ['contrato-ativo-recolha', motoristaId, viaturaId],
    queryFn: async () => {
      const query = supabase
        .from('contratos')
        .select(
          'id, numero_contrato, status, km_checkout, combustivel_checkout, eletricidade_checkout'
        )
        .eq('status', 'ativo')
        .order('criado_em', { ascending: false })
        .limit(1);
      const { data, error } = motoristaId
        ? await query.eq('motorista_id', motoristaId).maybeSingle()
        : await query.eq('viatura_id', viaturaId).maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        numero_contrato: number | null;
        status: string;
        km_checkout: number | null;
        combustivel_checkout: string | null;
        eletricidade_checkout: string | null;
      } | null;
    },
    enabled: !!motoristaId || !!viaturaId,
  });

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
    const sigs = assinaturasRef.current?.getAssinaturas() ?? {
      motorista: null,
      responsavel: null,
    };
    if (!fazerDepois) {
      const falta = papeisEmFalta(sigs);
      if (falta.length > 0) {
        const labels = falta.map((p) => (p === 'motorista' ? 'do motorista' : 'do responsável'));
        const ok = window.confirm(
          `Falta a assinatura ${labels.join(' e ')}. Concluir mesmo assim?`
        );
        if (!ok) return;
      }
    }
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
    setSaving(true);
    try {
      // 1. Create the recolha calendar event
      const dataISO = diaTodo
        ? new Date(`${data}T00:00:00`).toISOString()
        : new Date(`${data}T${hora}:00`).toISOString();

      const eventoPayload: Record<string, any> = {
        titulo: viatura.matricula.replace(/[-\s]/g, '').toUpperCase(),
        tipo: eventoData.tipo,
        data_inicio: dataISO,
        data_fim: null,
        dia_todo: diaTodo,
        cidade: estacaoNome || null,
        descricao: observacoes.trim() || null,
        criado_por: userId,
        // Fase 3.5: recolha imediata fica marcada; diferida fica IS NULL para aparecer na lista
        realizado_em: fazerDepois ? null : dataISO,
        realizado_por_id: fazerDepois ? null : userId,
      };
      if (motoristaId) eventoPayload.motorista_id = motoristaId;
      // Fase 1b: carimba o evento de recolha com a origem do contrato, para a
      // leitura das listas poder ser unificada (legacy + renting) tal como a
      // entrega. Sem matricula_devolver ⇒ não colide com os matchers dos
      // drawers de conclusão (que filtram origem_tipo IS NULL + matricula).
      if (contrato) {
        eventoPayload.origem_tipo = 'contrato';
        eventoPayload.origem_id = contrato.id;
      }

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

      // 2. Close motorista_viaturas association (RPC — evita falha silenciosa
      // para quem só tem 'calendario_recolhas' e não 'motoristas_gestao')
      // Cast porque types.ts ainda não foi regenerado após nova RPC.
      await (supabase as any).rpc('fn_checkin_fechar_motorista_viatura', {
        p_motorista_id: motoristaId || null,
        p_viatura_id: viaturaId,
        p_data_fim: data,
      });

      // 3. Viatura status
      await supabase
        .from('viaturas')
        .update(
          fazerDepois
            ? { status: 'em_recolha', estacao_id: null }
            : { status: 'disponivel', estacao_id: estacaoId || null }
        )
        .eq('id', viaturaId);

      // 4. Notification (fire & forget)
      try {
        await supabase.functions.invoke('send-calendar-notification', {
          body: {
            matricula: eventoPayload.titulo,
            cidade: estacaoNome,
            tipo: 'recolha',
            data_inicio: dataISO,
            dia_todo: diaTodo,
            org_id: orgId,
          },
        });
      } catch {
        /* non-critical */
      }

      // 5. Contrato
      if (contrato) {
        await supabase
          .from('contratos')
          .update({
            ...(fazerDepois ? {} : { status: 'encerrado' }),
            calendario_evento_id: eventoId,
          })
          .eq('id', contrato.id);
      }

      if (!fazerDepois) {
        // 6. KM, combustivel, danos
        if (contrato) {
          await saveCheckinDados({
            dados: checkinDados,
            contratoId: contrato.id,
            viaturaId,
            userId,
            tipo: 'checkin',
            motoristaId,
          });

          // 6a. Assinaturas — falha não reverte o handover
          try {
            await guardarAssinaturas.mutateAsync({
              eventoId,
              contratoId: contrato.id,
              orgId,
              assinadoPorId: userId,
              motoristaNome: motoristaNome ?? '',
              motoristaId,
              responsavelNome,
              sigMotorista: sigs.motorista,
              sigResponsavel: sigs.responsavel,
            });
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Erro inesperado';
            toast.error('Recolha concluída, mas falha ao guardar assinatura — repita.', {
              description: message,
            });
          }
        }

        // 6b. Folha de danos (template) — danos ligados a este contrato + KMs
        if (contrato && viaturaId) {
          try {
            const { data: tmplRows } = await supabase
              .from('document_templates')
              .select('id')
              .eq('tipo', 'anexo_danos')
              .eq('ativo', true)
              .limit(1);
            const tmpl = tmplRows?.[0];
            if (tmpl) {
              const pdf = await generateDocumentFromTemplate({
                templateId: tmpl.id,
                motoristaData: { nome: motoristaNome ?? '' },
                documentData: {
                  viatura_matricula: viatura?.matricula ?? '',
                  assinatura_motorista: sigs.motorista ?? '',
                },
                viaturaId,
                contratoId: contrato.id,
                km_saida: contrato.km_checkout?.toString() ?? '',
                km_entrada: checkinDados.km,
                // Numa eléctrica o nível vive nas colunas eletricidade_*; a
                // folha lê sempre combustivel_*, por isso sem isto as duas
                // metades saíam em branco. Ver nivelEnergia.
                combustivel_saida: nivelEnergia(viatura.combustivel, {
                  combustivel: contrato.combustivel_checkout,
                  eletricidade: contrato.eletricidade_checkout,
                }),
                combustivel_entrada: nivelEnergia(viatura.combustivel, {
                  combustivel: checkinDados.combustivel,
                  eletricidade: checkinDados.nivelEletrico,
                }),
                momentoFolha: isDevolucao ? 'DEVOLUÇÃO' : 'RECOLHA',
                action: 'print',
              });
              if (pdf && motoristaId) {
                const { data: mot } = await supabase
                  .from('motoristas_ativos')
                  .select('email')
                  .eq('id', motoristaId)
                  .maybeSingle();
                void emailFolhaDanos({
                  pdf,
                  to: mot?.email,
                  toNome: motoristaNome,
                  matricula: viatura?.matricula ?? '',
                  momento: 'RECOLHA',
                  orgId,
                  viaturaId: viatura?.id,
                });
              }
            }
          } catch {
            /* não bloqueia o fluxo principal */
          }
        }

        // 7. Upload checkin media
        if (files.length > 0 && contrato) {
          const mediaRecords: any[] = [];
          for (const { file } of files) {
            const ext = file.name.split('.').pop() || 'bin';
            const path = `${contrato.id}/checkin/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from('contrato-media')
              .upload(path, file, { contentType: file.type });
            if (upErr) throw upErr;
            mediaRecords.push({
              contrato_id: contrato.id,
              tipo: 'checkin',
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
      }

      // 8. Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['calendario-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['viaturas-calendario'] });
      queryClient.invalidateQueries({ queryKey: ['viaturas-pendentes-recolha'] });
      queryClient.invalidateQueries({ queryKey: ['motorista-viaturas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'checkin-checkout-historico'] });

      toast.success(
        fazerDepois
          ? isDevolucao
            ? 'Devolução registada — check-in pendente'
            : 'Recolha registada — check-in pendente'
          : isDevolucao
            ? 'Devolução confirmada'
            : 'Recolha confirmada'
      );
      // Só aqui: enquanto a submissão não passar, o rascunho tem de aguentar
      // um refresh, um erro de rede ou um fecho por engano.
      void limparRascunho();
      setDone(true);
      setTimeout(() => onConcluir(), 1500);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registar recolha');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4">
        <CheckCircle
          className={cn('h-16 w-16', isDevolucao ? 'text-orange-500' : 'text-blue-500')}
        />
        <p className="text-xl font-semibold">
          {isDevolucao ? 'Devolução confirmada!' : 'Recolha confirmada!'}
        </p>
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
          <h1 className="text-base font-semibold leading-tight">
            {isDevolucao ? 'Checkin de Devolução' : 'Checkin de Recolha'}
          </h1>
          <p className="text-xs text-muted-foreground truncate">
            {motoristaNome ? `${motoristaNome} — ` : ''}
            {formatMatricula(viatura.matricula)}
          </p>
        </div>
        <Button onClick={handleConfirm} disabled={saving} className="shrink-0">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar...
            </>
          ) : (
            'Confirmar'
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          <div
            className={cn(
              'rounded-lg border p-4 text-sm',
              isDevolucao
                ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300'
                : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
            )}
          >
            <p className="font-medium">
              {isDevolucao ? 'Devolução pronta para registar.' : 'Recolha pronta para registar.'}
            </p>
            <p className="mt-0.5 opacity-80">Adicione fotos de checkin ou confirme sem fotos.</p>
          </div>

          {loadingContrato ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />A verificar contrato ativo...
            </div>
          ) : contrato ? (
            <div className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Contrato Ativo Encontrado</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono">
                  CT-{String(contrato.numero_contrato ?? 0).padStart(4, '0')}
                </Badge>
                <Badge variant="default">Ativo</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Será marcado como encerrado após confirmar.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              {motoristaId
                ? 'Nenhum contrato ativo encontrado para este motorista.'
                : 'Motorista não identificado — não é possível associar fotos a um contrato.'}
            </div>
          )}

          {!fazerDepois && (
            <>
              <CheckinDadosSection
                viaturaId={viaturaId}
                kmMinimo={viatura.km_atual ?? 0}
                dados={checkinDados}
                onChange={setCheckinDados}
                tipo="checkin"
                tipoCombustivel={viatura.combustivel ?? ''}
                motoristaNome={motoristaNome}
                matricula={formatMatricula(viatura.matricula)}
                dataEvento={data}
                contratoNumero={contrato?.numero_contrato}
                accentClass={
                  isDevolucao
                    ? 'border-orange-200 dark:border-orange-800'
                    : 'border-blue-200 dark:border-blue-800'
                }
              />

              <AssinaturasHandoverSection
                ref={assinaturasRef}
                motoristaNome={motoristaNome ?? ''}
                responsavelNome={responsavelNome}
              />

              <div className="space-y-3">
                <Label>
                  Fotos / Vídeos{' '}
                  <span className="text-muted-foreground font-normal text-xs">
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
        </div>
      </div>
    </div>
  );
};
