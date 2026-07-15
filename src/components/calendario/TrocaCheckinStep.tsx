import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { gerarContratoAtomico } from '@/hooks/useContratos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, ArrowLeftRight, CheckCircle, Film, Loader2, Upload, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatMatricula } from './calendarioUtils';
import type { PendingTrocaData } from './NovoEventoPage';
import {
  CheckinDadosSection,
  emptyCheckinDados,
  validateCheckinDados,
  saveCheckinDados,
} from './CheckinDadosSection';
import type { CheckinDadosState } from './CheckinDadosSection';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import { CidadeAssinaturaField } from '@/components/documentos/CidadeAssinaturaField';
import { useOrgId } from '@/contexts/TenantContext';

interface SelectedFile {
  id: string;
  file: File;
  preview: string | null;
}

export const TrocaCheckinStep: React.FC<{
  trocaData: PendingTrocaData;
  onConcluir: () => void;
  onVoltar: () => void;
}> = ({ trocaData, onConcluir, onVoltar }) => {
  const {
    tipo,
    motoristaId,
    motoristaNome,
    viaturaAtual,
    novaViatura,
    userId,
    data,
    hora,
    diaTodo,
    observacoes,
    estacaoId,
    estacaoNome,
    fazerDepois,
  } = trocaData;

  const queryClient = useQueryClient();
  const orgId = useOrgId();
  const { empresas } = useClientesEmpresas();

  const [filesCheckin, setFilesCheckin] = useState<SelectedFile[]>([]);
  const [filesCheckout, setFilesCheckout] = useState<SelectedFile[]>([]);
  const [dadosCheckin, setDadosCheckin] = useState<CheckinDadosState>(emptyCheckinDados);
  const [dadosCheckout, setDadosCheckout] = useState<CheckinDadosState>(emptyCheckinDados);
  const [dataInicio, setDataInicio] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [cidadeAssinatura, setCidadeAssinatura] = useState('Leiria');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [contratoNumero, setContratoNumero] = useState<number | null>(null);

  const fileInputCheckinRef = useRef<HTMLInputElement>(null);
  const fileInputCheckoutRef = useRef<HTMLInputElement>(null);

  const { data: contratoAtual } = useQuery({
    queryKey: ['contrato-ativo-troca', motoristaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contratos')
        .select('id, numero_contrato, status')
        .eq('motorista_id', motoristaId)
        .eq('status', 'ativo')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; numero_contrato: number | null; status: string } | null;
    },
    enabled: !!motoristaId,
  });

  const { data: motoristaFull } = useQuery({
    queryKey: ['motorista-full-troca', motoristaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('motoristas_ativos')
        .select('id, nome, nif, email, telefone, morada, documento_tipo, documento_numero')
        .eq('id', motoristaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!motoristaId,
  });

  const makeHandler =
    (setter: React.Dispatch<React.SetStateAction<SelectedFile[]>>) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files || []);
      setter((prev) => [
        ...prev,
        ...selected.map((f) => ({
          id: Math.random().toString(36).slice(2),
          file: f,
          preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
        })),
      ]);
      e.target.value = '';
    };

  const removeFile = (setter: React.Dispatch<React.SetStateAction<SelectedFile[]>>, id: string) => {
    setter((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f?.preview) URL.revokeObjectURL(f.preview);
      return prev.filter((x) => x.id !== id);
    });
  };

  const uploadFiles = async (
    files: SelectedFile[],
    contratoId: string,
    tipoMedia: 'checkin' | 'checkout'
  ) => {
    const records: any[] = [];
    for (const { file } of files) {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${contratoId}/${tipoMedia}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from('contrato-media')
        .upload(path, file, { contentType: file.type });
      if (error) throw error;
      records.push({
        contrato_id: contratoId,
        tipo: tipoMedia,
        url: path,
        nome_ficheiro: file.name,
        tipo_ficheiro: file.type,
        tamanho_bytes: file.size,
        criado_por: userId,
      });
    }
    if (records.length > 0) {
      const { error } = await supabase.from('contrato_media').insert(records);
      if (error) throw error;
    }
  };

  const handleConfirm = async () => {
    if (!fazerDepois) {
      if (filesCheckin.length === 0) {
        toast.error('Adicione pelo menos uma foto de checkin da viatura devolvida');
        return;
      }
      if (filesCheckout.length === 0) {
        toast.error('Adicione pelo menos uma foto de checkout da nova viatura');
        return;
      }
      const checkinErr = validateCheckinDados(
        dadosCheckin,
        viaturaAtual.km_atual ?? 0,
        viaturaAtual.combustivel ?? ''
      );
      if (checkinErr) {
        toast.error(`Checkin — ${checkinErr}`);
        return;
      }
      const checkoutErr = validateCheckinDados(
        dadosCheckout,
        novaViatura.km_atual ?? 0,
        novaViatura.combustivel ?? ''
      );
      if (checkoutErr) {
        toast.error(`Checkout — ${checkoutErr}`);
        return;
      }
    }
    const empresaId = empresas[0]?.id;
    if (!empresaId) {
      toast.error('Nenhuma empresa configurada');
      return;
    }
    if (!cidadeAssinatura.trim()) {
      toast.error('Indique a cidade de assinatura');
      return;
    }

    setSaving(true);
    try {
      const dataISO = diaTodo
        ? new Date(`${data}T00:00:00`).toISOString()
        : new Date(`${data}T${hora}:00`).toISOString();

      // 1. Criar evento de troca
      const eventoPayload: Record<string, any> = {
        titulo: novaViatura.matricula.replace(/[-\s]/g, '').toUpperCase(),
        tipo,
        data_inicio: dataISO,
        data_fim: null,
        dia_todo: diaTodo,
        cidade: estacaoNome || null,
        descricao: observacoes.trim() || null,
        matricula_devolver: viaturaAtual.matricula.replace(/[-\s]/g, '').toUpperCase(),
        criado_por: userId,
        motorista_id: motoristaId,
        // Fase 3.5: troca diferida aparece na lista de pendentes via origem
        ...(contratoAtual ? { origem_tipo: 'contrato', origem_id: contratoAtual.id } : {}),
        // Fase 3.5: troca imediata fica realizada; diferida fica IS NULL
        ...(!fazerDepois ? { realizado_em: dataISO, realizado_por_id: userId } : {}),
      };
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

      // 2. Fechar associação antiga (RPC — evita falha silenciosa para quem
      // só tem 'calendario_recolhas' e não 'motoristas_gestao')
      // Cast porque types.ts ainda não foi regenerado após nova RPC.
      await (supabase as any).rpc('fn_checkin_fechar_motorista_viatura', {
        p_motorista_id: motoristaId || null,
        p_viatura_id: viaturaAtual.id,
        p_data_fim: data,
      });

      // 3. Criar nova associação
      await (supabase as any).rpc('fn_checkin_abrir_motorista_viatura', {
        p_motorista_id: motoristaId,
        p_viatura_id: novaViatura.id,
        p_data_inicio: data,
        p_observacoes: observacoes.trim() || null,
      });

      // 4. Atualizar status das viaturas
      await supabase
        .from('viaturas')
        .update({ status: 'disponivel', estacao_id: estacaoId || null })
        .eq('id', viaturaAtual.id);
      await supabase
        .from('viaturas')
        .update({ status: 'em_uso', estacao_id: null })
        .eq('id', novaViatura.id);

      // 5. Encerrar contrato antigo + km/fuel/danos + fotos checkin
      if (contratoAtual) {
        await supabase
          .from('contratos')
          .update({ status: 'encerrado', calendario_evento_id: eventoId })
          .eq('id', contratoAtual.id);
        if (!fazerDepois) {
          await saveCheckinDados({
            dados: dadosCheckin,
            contratoId: contratoAtual.id,
            viaturaId: viaturaAtual.id,
            userId,
            tipo: 'checkin',
            motoristaId,
          });
          if (filesCheckin.length > 0) await uploadFiles(filesCheckin, contratoAtual.id, 'checkin');
        }
      }

      // 6. Criar novo contrato para a nova viatura (via RPC atómica)
      const newCt = await gerarContratoAtomico({
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
        viaturaId: novaViatura.id,
        calendarioEventoId: eventoId,
      });
      setContratoNumero(newCt.numero_contrato);

      // 7. KM/fuel/danos checkout da nova viatura + fotos
      if (!fazerDepois) {
        await saveCheckinDados({
          dados: dadosCheckout,
          contratoId: newCt.id,
          viaturaId: novaViatura.id,
          userId,
          tipo: 'checkout',
          motoristaId,
        });
        if (filesCheckout.length > 0) await uploadFiles(filesCheckout, newCt.id, 'checkout');
      }

      // 8. Notificação (fire & forget)
      try {
        await supabase.functions.invoke('send-calendar-notification', {
          body: {
            matricula: eventoPayload.titulo,
            cidade: estacaoNome,
            tipo,
            data_inicio: dataISO,
            dia_todo: diaTodo,
            org_id: orgId,
          },
        });
      } catch {
        /* non-critical */
      }

      // 9. Invalidar caches
      queryClient.invalidateQueries({ queryKey: ['calendario-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['viaturas-calendario'] });
      queryClient.invalidateQueries({ queryKey: ['motorista-viaturas'] });

      toast.success(
        `Troca registada — CT-${String(newCt.numero_contrato ?? 0).padStart(4, '0')} criado`
      );
      setDone(true);
      setTimeout(() => onConcluir(), 1500);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registar troca');
    } finally {
      setSaving(false);
    }
  };

  const FileGrid = ({
    files,
    onRemove,
  }: {
    files: SelectedFile[];
    onRemove: (id: string) => void;
  }) => (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {files.map((f) => (
        <div
          key={f.id}
          className="relative rounded-lg overflow-hidden border border-border aspect-square bg-muted"
        >
          {f.preview ? (
            <img src={f.preview} alt={f.file.name} className="w-full h-full object-cover" />
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
            onClick={() => onRemove(f.id)}
            className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white hover:bg-black/80"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4">
        <CheckCircle className="h-16 w-16 text-purple-500" />
        <p className="text-xl font-semibold">Troca registada!</p>
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
          <h1 className="text-base font-semibold leading-tight">Checkin / Checkout de Troca</h1>
          <p className="text-xs text-muted-foreground truncate">
            {motoristaNome} — {formatMatricula(viaturaAtual.matricula)} →{' '}
            {formatMatricula(novaViatura.matricula)}
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
          <div className="rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/30 p-4 text-sm text-purple-700 dark:text-purple-300">
            <p className="font-medium flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              {fazerDepois
                ? 'Troca de viatura — check-in/check-out ficam pendentes. Pode confirmar diretamente.'
                : 'Troca de viatura — adicione fotos ou confirme sem fotos.'}
            </p>
          </div>

          {/* ── Checkin — viatura devolvida ── */}
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                  Checkin — Viatura Devolvida
                </p>
                <p className="text-xs text-muted-foreground">
                  {viaturaAtual.marca} {viaturaAtual.modelo}
                </p>
              </div>
              <Badge variant="outline" className="font-mono shrink-0">
                {formatMatricula(viaturaAtual.matricula)}
              </Badge>
            </div>

            {contratoAtual && (
              <p className="text-xs text-muted-foreground">
                Contrato CT-{String(contratoAtual.numero_contrato ?? 0).padStart(4, '0')} será
                encerrado.
              </p>
            )}

            <CheckinDadosSection
              viaturaId={viaturaAtual.id}
              kmMinimo={viaturaAtual.km_atual ?? 0}
              dados={dadosCheckin}
              onChange={setDadosCheckin}
              tipo="checkin"
              tipoCombustivel={viaturaAtual.combustivel ?? ''}
              motoristaNome={motoristaNome}
              matricula={formatMatricula(viaturaAtual.matricula)}
              dataEvento={data}
              contratoNumero={contratoAtual?.numero_contrato}
              accentClass="border-blue-200 dark:border-blue-800"
            />

            <input
              ref={fileInputCheckinRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={makeHandler(setFilesCheckin)}
            />
            <button
              type="button"
              onClick={() => fileInputCheckinRef.current?.click()}
              className="w-full rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors py-6 flex flex-col items-center gap-2 text-sm text-muted-foreground cursor-pointer"
            >
              <Upload className="h-6 w-6 opacity-40" />
              <span>
                Fotos / vídeos de checkin{' '}
                {fazerDepois ? (
                  <span className="text-xs text-muted-foreground font-medium">opcional</span>
                ) : (
                  <span className="text-xs text-red-500 font-medium">*obrigatório</span>
                )}
              </span>
            </button>
            {filesCheckin.length > 0 && (
              <FileGrid files={filesCheckin} onRemove={(id) => removeFile(setFilesCheckin, id)} />
            )}
          </div>

          {/* ── Checkout — nova viatura ── */}
          <div className="rounded-lg border border-green-200 dark:border-green-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                  Checkout — Nova Viatura
                </p>
                <p className="text-xs text-muted-foreground">
                  {novaViatura.marca} {novaViatura.modelo}
                </p>
              </div>
              <Badge variant="outline" className="font-mono shrink-0">
                {formatMatricula(novaViatura.matricula)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data de Início</Label>
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <CidadeAssinaturaField
                value={cidadeAssinatura}
                onChange={setCidadeAssinatura}
                label="Cidade Assinatura"
              />
            </div>

            <CheckinDadosSection
              viaturaId={novaViatura.id}
              kmMinimo={novaViatura.km_atual ?? 0}
              dados={dadosCheckout}
              onChange={setDadosCheckout}
              tipo="checkout"
              tipoCombustivel={novaViatura.combustivel ?? ''}
              motoristaNome={motoristaNome}
              matricula={formatMatricula(novaViatura.matricula)}
              dataEvento={dataInicio}
              accentClass="border-green-200 dark:border-green-800"
            />

            <input
              ref={fileInputCheckoutRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={makeHandler(setFilesCheckout)}
            />
            <button
              type="button"
              onClick={() => fileInputCheckoutRef.current?.click()}
              className="w-full rounded-lg border-2 border-dashed border-green-300 dark:border-green-700 hover:border-green-400 hover:bg-green-50/50 dark:hover:bg-green-950/30 transition-colors py-6 flex flex-col items-center gap-2 text-sm text-muted-foreground cursor-pointer"
            >
              <Upload className="h-6 w-6 opacity-40" />
              <span>
                Fotos / vídeos de checkout{' '}
                {fazerDepois ? (
                  <span className="text-xs text-muted-foreground font-medium">opcional</span>
                ) : (
                  <span className="text-xs text-red-500 font-medium">*obrigatório</span>
                )}
              </span>
            </button>
            {filesCheckout.length > 0 && (
              <FileGrid files={filesCheckout} onRemove={(id) => removeFile(setFilesCheckout, id)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
