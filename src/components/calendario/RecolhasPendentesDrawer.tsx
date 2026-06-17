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
  const [selected, setSelected] = useState<ViaturaEmRecolha | null>(null);
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

  const { data: viaturas = [], isLoading } = useQuery({
    queryKey: ['viaturas-pendentes-recolha'],
    queryFn: async () => {
      // Fase 3: ler de calendario_eventos em vez de viaturas.status='em_recolha'
      const now = new Date().toISOString();

      // Query com type casting para evitar type inference complexity
      const query = supabase
        .from('calendario_eventos' as any)
        .select(
          `
          data_inicio,
          contratos!inner(
            id, viatura_id, status,
            viaturas(id, matricula, marca, modelo, categoria, km_atual, combustivel)
          )
        `
        ) as any;

      const { data, error } = await query
        .in('tipo', ['recolha', 'devolucao'])
        .eq('origen_tipo', 'contrato')
        .is('realizado_em', null)
        .lte('data_inicio', now)
        .eq('contratos.status', 'ativo')
        .order('data_inicio', { ascending: false });

      if (error) throw error;

      const items = (data || []) as any[];
      if (items.length === 0) return [];

      // Deduplicate by viatura_id (only one event per viatura)
      const seen = new Set<string>();
      return items
        .filter((ev: any) => {
          const vId = ev.contratos.viaturas.id;
          if (seen.has(vId)) return false;
          seen.add(vId);
          return true;
        })
        .map((ev: any) => ev.contratos.viaturas) as ViaturaEmRecolha[];
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

  // Fetch active contrato + motorista for the selected vehicle (for folha de danos)
  const { data: contratoInfo } = useQuery({
    queryKey: ['contrato-recolha-pendente', selected?.id],
    queryFn: async () => {
      const { data: ct } = await supabase
        .from('contratos')
        .select('id, numero_contrato, motorista_id')
        .eq('viatura_id', selected!.id)
        .eq('status', 'ativo')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ct) return null;

      let motoristaNome = '';
      if (ct.motorista_id) {
        const { data: mot } = await supabase
          .from('profiles')
          .select('nome')
          .eq('id', ct.motorista_id)
          .maybeSingle();
        motoristaNome = mot?.nome || '';
      }
      return {
        contratoId: ct.id,
        contratoNumero: ct.numero_contrato as number | null,
        motoristaNome,
        motoristaId: ct.motorista_id as string | null,
      };
    },
    enabled: !!selected?.id,
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
      selected.km_atual ?? 0,
      selected.combustivel ?? ''
    );
    if (checkinErr) {
      toast.error(checkinErr);
      return;
    }
    setSaving(true);
    try {
      // 1. Encontrar contrato ativo para esta viatura
      const { data: contrato } = await supabase
        .from('contratos')
        .select('id, numero_contrato')
        .eq('viatura_id', selected.id)
        .eq('status', 'ativo')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 2. Viatura → disponivel + estação
      await supabase
        .from('viaturas')
        .update({ status: 'disponivel', estacao_id: estacaoId })
        .eq('id', selected.id);

      // 3. Encerrar contrato + km/fuel/danos
      if (contrato) {
        await supabase.from('contratos').update({ status: 'encerrado' }).eq('id', contrato.id);
        await saveCheckinDados({
          dados: checkinDados,
          contratoId: contrato.id,
          viaturaId: selected.id,
          userId,
          tipo: 'checkin',
          motoristaId: (contrato as { motoristaId?: string }).motoristaId || undefined,
        });

        // 4. Upload fotos se existirem
        if (files.length > 0) {
          const records: any[] = [];
          for (const { file } of files) {
            const ext = file.name.split('.').pop() || 'bin';
            const path = `${contrato.id}/checkin/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const { error } = await supabase.storage
              .from('contrato-media')
              .upload(path, file, { contentType: file.type });
            if (error) throw error;
            records.push({
              contrato_id: contrato.id,
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
      }

      // Fase 4: Marca o evento 'recolha'/'devolucao' como realizado (em calendario_eventos)
      if (contrato?.id) {
        const now = new Date().toISOString();
        const query = supabase
          .from('calendario_eventos' as any)
          .select('id') as any;
        const { data: evMatch } = (await query
          .in('tipo', ['recolha', 'devolucao'])
          .eq('origen_tipo', 'contrato')
          .eq('origen_id', contrato.id)
          .is('realizado_em', null)
          .limit(1)
          .maybeSingle()) as any;

        if (evMatch?.id) {
          await supabase
            .from('calendario_eventos')
            .update({
              realizado_em: now,
              realizado_por_id: userId,
            })
            .eq('id', evMatch.id);
        }
      }

      // 5. Invalidar caches
      queryClient.invalidateQueries({ queryKey: ['viaturas-pendentes-recolha'] });
      queryClient.invalidateQueries({ queryKey: ['viaturas-calendario'] });
      queryClient.invalidateQueries({ queryKey: ['motorista-viaturas'] });
      queryClient.invalidateQueries({ queryKey: ['calendario-eventos'] });

      toast.success(`Check-in de ${formatMatricula(selected.matricula)} confirmado`);
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
              {formatMatricula(selected.matricula)} — {selected.marca} {selected.modelo}
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
              viaturaId={selected.id}
              kmMinimo={selected.km_atual ?? 0}
              dados={checkinDados}
              onChange={setCheckinDados}
              tipo="checkin"
              tipoCombustivel={selected.combustivel ?? ''}
              motoristaNome={contratoInfo?.motoristaNome || ''}
              matricula={formatMatricula(selected.matricula)}
              dataEvento={new Date().toISOString().slice(0, 10)}
              contratoNumero={contratoInfo?.contratoNumero}
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
            {viaturas.length + rentingRecolhasPendentes.length > 0 && (
              <Badge className="bg-orange-500 text-white">
                {viaturas.length + rentingRecolhasPendentes.length}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : viaturas.length === 0 && rentingRecolhasPendentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <CheckCircle className="h-10 w-10 opacity-30" />
              <p className="text-sm">Nenhuma recolha pendente</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Pendentes de renting — mesma estética dos legacy. */}
              <RentingPendentesSection tipo="recolha" />
              {viaturas.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className={cn('rounded-lg p-2 bg-orange-500/10 shrink-0')}>
                    <Car className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-semibold text-sm">
                      {formatMatricula(v.matricula)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {v.marca} {v.modelo}
                    </p>
                    {v.categoria && (
                      <p className="text-xs text-muted-foreground/70">{v.categoria}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400"
                    onClick={() => setSelected(v)}
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
