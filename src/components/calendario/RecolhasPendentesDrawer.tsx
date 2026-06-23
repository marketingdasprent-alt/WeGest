import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Camera,
  Car,
  CheckCircle,
  Film,
  Loader2,
  MapPin,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMatricula, SearchableDropdown } from './calendarioUtils';
import { RentingPendentesSection } from './RentingPendentesSection';
import { useEventosPendentesRenting } from '@/hooks/useEventosPendentesRenting';
import {
  CheckinDadosSection,
  emptyCheckinDados,
  validateCheckinDados,
  saveCheckinDados,
} from './CheckinDadosSection';
import type { CheckinDadosState } from './CheckinDadosSection';

interface ViaturaEmRecolha {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  categoria: string | null;
  km_atual: number | null;
  combustivel: string | null;
}

/** Item da lista de pendentes com todos os dados necessários para confirmar. */
interface RecolhaPendente {
  viatura: ViaturaEmRecolha;
  contratoId: string;
  contratoNumero: number | null;
  motoristaId: string | null;
  eventoId: string;
}

interface SelectedFile {
  id: string;
  file: File;
  preview: string | null;
}

interface Estacao {
  id: string;
  nome: string;
  cidade: string | null;
}

interface RecolhasPendentesDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
}

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export const RecolhasPendentesDrawer: React.FC<RecolhasPendentesDrawerProps> = ({
  open,
  onOpenChange,
  userId,
}) => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<RecolhaPendente | null>(null);
  const [estacaoId, setEstacaoId] = useState('');
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [checkinDados, setCheckinDados] = useState<CheckinDadosState>(emptyCheckinDados);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dragOverRef = useRef<HTMLDivElement>(null);

  // Pendentes de renting — usado para o empty state e para o badge.
  const { data: rentingRecolhasPendentes = [] } = useEventosPendentesRenting({
    tipo: 'recolha',
  });

  // Two-step: evita join embed (sem FK directa calendario_eventos→contratos via origem_id).
  // Fase 3.5: inclui 'troca', sem filtro de contrato.status.
  const { data: pendentes = [], isLoading } = useQuery({
    queryKey: ['viaturas-pendentes-recolha'],
    queryFn: async () => {
      const now = new Date().toISOString();

      // Step 1: eventos pendentes (recolha/devolucao/troca com origem contrato)
      const { data: eventos, error: evErr } = await supabase
        .from('calendario_eventos')
        .select('id, data_inicio, origem_id')
        .in('tipo', ['recolha', 'devolucao', 'troca'])
        .eq('origem_tipo', 'contrato')
        .is('realizado_em', null)
        .lte('data_inicio', now)
        .order('data_inicio', { ascending: false });
      if (evErr) throw evErr;

      const contratoIds = [
        ...new Set((eventos ?? []).map((e) => e.origem_id).filter((x): x is string => !!x)),
      ];
      if (contratoIds.length === 0) return [];

      // Step 2: contratos + viaturas para esses IDs
      const { data: contratos, error: ctErr } = await supabase
        .from('contratos')
        .select(
          'id, viatura_id, numero_contrato, motorista_id, status, viaturas(id, matricula, marca, modelo, categoria, km_atual, combustivel)'
        )
        .in('id', contratoIds);
      if (ctErr) throw ctErr;

      const contratoMap = new Map((contratos ?? []).map((ct) => [ct.id, ct]));

      // Dedup por viatura — evento mais recente ganha (query já está DESC)
      const seen = new Set<string>();
      const result: RecolhaPendente[] = [];
      for (const ev of eventos ?? []) {
        if (!ev.origem_id) continue;
        const ct = contratoMap.get(ev.origem_id);
        const viatura = (ct as any)?.viaturas as ViaturaEmRecolha | null | undefined;
        if (!viatura?.id || seen.has(viatura.id)) continue;
        seen.add(viatura.id);
        result.push({
          viatura,
          contratoId: ct!.id,
          contratoNumero: (ct as any).numero_contrato,
          motoristaId: (ct as any).motorista_id,
          eventoId: ev.id,
        });
      }
      return result;
    },
    enabled: open,
  });

  const { data: estacoes = [] } = useQuery({
    queryKey: ['estacoes-calendario'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estacoes')
        .select('id, nome, cidade, ativa')
        .eq('ativa', true)
        .order('nome');
      if (error) throw error;
      return data as Estacao[];
    },
    enabled: open,
  });

  // Busca apenas o nome do motorista — o resto vem do embed da query principal.
  const { data: contratoInfo } = useQuery({
    queryKey: ['motorista-nome-recolha-pendente', selected?.motoristaId],
    queryFn: async () => {
      if (!selected?.motoristaId) return { motoristaNome: '' };
      const { data: mot } = await supabase
        .from('profiles')
        .select('nome')
        .eq('id', selected.motoristaId)
        .maybeSingle();
      return { motoristaNome: mot?.nome || '' };
    },
    enabled: !!selected?.motoristaId,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sel = Array.from(e.target.files || []);
    setFiles((prev) => [
      ...prev,
      ...sel.map((f) => ({
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

  const resetCheckin = () => {
    setSelected(null);
    setEstacaoId('');
    setFiles([]);
    setCheckinDados(emptyCheckinDados);
    setDone(false);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    const { viatura, contratoId, eventoId } = selected;
    if (!estacaoId) {
      toast.error('Estação de chegada é obrigatória');
      return;
    }
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
    setSaving(true);
    try {
      // 1. Viatura → disponivel + estação
      await supabase
        .from('viaturas')
        .update({ status: 'disponivel', estacao_id: estacaoId })
        .eq('id', viatura.id);

      // 2. Encerrar contrato (idempotente — troca já o encerrou)
      await supabase.from('contratos').update({ status: 'encerrado' }).eq('id', contratoId);

      // 3. KM, combustivel, danos
      await saveCheckinDados({
        dados: checkinDados,
        contratoId,
        viaturaId: viatura.id,
        userId,
        tipo: 'checkin',
        motoristaId: selected.motoristaId || undefined,
      });

      // 4. Upload fotos se existirem
      if (files.length > 0) {
        const records: any[] = [];
        for (const { file } of files) {
          const ext = file.name.split('.').pop() || 'bin';
          const path = `${contratoId}/checkin/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { error } = await supabase.storage
            .from('contrato-media')
            .upload(path, file, { contentType: file.type });
          if (error) throw error;
          records.push({
            contrato_id: contratoId,
            tipo: 'checkin',
            url: path,
            nome_ficheiro: file.name,
            tipo_ficheiro: file.type,
            tamanho_bytes: file.size,
            criado_por: userId,
          });
        }
        const { error } = await supabase.from('contrato_media').insert(records);
        if (error) throw error;
      }

      // 5. Marca o evento como realizado (usa eventoId directamente — sem re-query)
      await supabase
        .from('calendario_eventos')
        .update({ realizado_em: new Date().toISOString(), realizado_por_id: userId })
        .eq('id', eventoId);

      // 6. Invalidar caches
      queryClient.invalidateQueries({ queryKey: ['viaturas-pendentes-recolha'] });
      queryClient.invalidateQueries({ queryKey: ['checkin-pendentes-count'] });
      queryClient.invalidateQueries({ queryKey: ['viaturas-calendario'] });
      queryClient.invalidateQueries({ queryKey: ['motorista-viaturas'] });
      queryClient.invalidateQueries({ queryKey: ['calendario-eventos'] });

      toast.success(`Check-in de ${formatMatricula(viatura.matricula)} confirmado`);
      setDone(true);
      setTimeout(() => resetCheckin(), 1200);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao confirmar check-in');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetCheckin();
    onOpenChange(v);
  };

  // ── Full-page check-in step ───────────────────────────────────────────────
  if (selected && open) {
    const { viatura } = selected;
    if (done) {
      return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4">
          <CheckCircle className="h-16 w-16 text-green-500" />
          <p className="text-xl font-semibold">Check-in confirmado!</p>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-card shrink-0">
          <Button variant="ghost" size="icon" onClick={resetCheckin} disabled={saving}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight">Check-in na Estação</h1>
            <p className="text-xs text-muted-foreground truncate">
              {formatMatricula(viatura.matricula)} — {viatura.marca} {viatura.modelo}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-4 text-sm text-green-700 dark:text-green-300">
              <p className="font-medium">Viatura chegou à estação.</p>
              <p className="mt-0.5 opacity-80 text-xs">
                Selecione a estação, preencha a condição da viatura e confirme.
              </p>
            </div>

            {/* Estação — obrigatória */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Estação de Chegada <span className="text-red-500 ml-1">*</span>
              </Label>
              <SearchableDropdown
                items={estacoes.map((e) => ({
                  id: e.id,
                  primary: e.nome,
                  secondary: e.cidade || undefined,
                }))}
                value={estacaoId}
                onChange={setEstacaoId}
                placeholder="Selecionar estação..."
                icon={<MapPin className="h-4 w-4" />}
                matchFn={(item, q) => {
                  const e = estacoes.find((x) => x.id === item.id);
                  if (!e) return false;
                  return norm(e.nome).includes(norm(q)) || norm(e.cidade || '').includes(norm(q));
                }}
              />
            </div>

            {/* KM, combustivel, danos */}
            <CheckinDadosSection
              viaturaId={viatura.id}
              kmMinimo={viatura.km_atual ?? 0}
              dados={checkinDados}
              onChange={setCheckinDados}
              tipo="checkin"
              tipoCombustivel={viatura.combustivel ?? ''}
              motoristaNome={contratoInfo?.motoristaNome || ''}
              matricula={formatMatricula(viatura.matricula)}
              dataEvento={new Date().toISOString().slice(0, 10)}
              contratoNumero={selected.contratoNumero}
              accentClass="border-orange-200 dark:border-orange-800"
            />

            {/* Fotos — opcional */}
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
                          <Film className="h-5 w-5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                            {f.file.name}
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render list ───────────────────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            Recolhas Pendentes de Check-in
            {pendentes.length + rentingRecolhasPendentes.length > 0 && (
              <Badge className="bg-orange-500 text-white">
                {pendentes.length + rentingRecolhasPendentes.length}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendentes.length === 0 && rentingRecolhasPendentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <CheckCircle className="h-10 w-10 opacity-30" />
              <p className="text-sm">Nenhuma recolha pendente</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Pendentes de renting — mesma estética dos legacy. */}
              <RentingPendentesSection tipo="recolha" />
              {pendentes.map((p) => (
                <div
                  key={p.viatura.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className={cn('rounded-lg p-2 bg-orange-500/10 shrink-0')}>
                    <Car className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-semibold text-sm">
                      {formatMatricula(p.viatura.matricula)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.viatura.marca} {p.viatura.modelo}
                    </p>
                    {p.viatura.categoria && (
                      <p className="text-xs text-muted-foreground/70">{p.viatura.categoria}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400"
                    onClick={() => setSelected(p)}
                  >
                    Check-in
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
