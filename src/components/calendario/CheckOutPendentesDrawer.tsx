import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Car, CheckCircle, Film, Loader2, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMatricula } from './calendarioUtils';
import {
  CheckinDadosSection,
  emptyCheckinDados,
  validateCheckinDados,
  saveCheckinDados,
} from './CheckinDadosSection';
import type { CheckinDadosState } from './CheckinDadosSection';
import { RentingPendentesSection } from './RentingPendentesSection';
import { useEventosPendentesRenting } from '@/hooks/useEventosPendentesRenting';

interface PendenteCheckout {
  id: string;
  numero_contrato: number | null;
  viatura_id: string;
  motorista_id: string | null;
  data_inicio: string | null;
  viaturas: {
    id: string;
    matricula: string;
    marca: string;
    modelo: string;
    km_atual: number | null;
    combustivel: string | null;
  } | null;
  motoristaNome: string;
}

interface SelectedFile {
  id: string;
  file: File;
  preview: string | null;
}

interface CheckOutPendentesDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
}

export const CheckOutPendentesDrawer: React.FC<CheckOutPendentesDrawerProps> = ({
  open,
  onOpenChange,
  userId,
}) => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<PendenteCheckout | null>(null);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [checkinDados, setCheckinDados] = useState<CheckinDadosState>(emptyCheckinDados);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dragOverRef = useRef<HTMLDivElement>(null);

  // Pendentes de renting — usado para o empty state e para o badge.
  const { data: rentingEntregasPendentes = [] } = useEventosPendentesRenting({
    tipo: 'entrega',
  });

  const { data: pendentes = [], isLoading } = useQuery({
    queryKey: ['contratos-checkout-pendentes'],
    queryFn: async () => {
      // Fase 3: ler de calendario_eventos em vez de contratos flags
      const query = supabase
        .from('calendario_eventos' as any)
        .select(
          `
          data_inicio,
          contratos!inner(
            id, numero_contrato, viatura_id, motorista_id, status,
            viaturas(id, matricula, marca, modelo, km_atual, combustivel)
          )
        `
        ) as any;

      const { data, error } = await query
        .eq('tipo', 'entrega')
        .eq('origen_tipo', 'contrato')
        .is('realizado_em', null)
        .eq('contratos.status', 'ativo')
        .order('data_inicio', { ascending: false });
      if (error) throw error;

      const items = (data || []) as any[];
      if (items.length === 0) return [];

      // Re-map para estrutura esperada (remapear do evento para contrato)
      const contractItems = items.map((ev: any) => ({
        id: ev.contratos.id,
        numero_contrato: ev.contratos.numero_contrato,
        viatura_id: ev.contratos.viatura_id,
        motorista_id: ev.contratos.motorista_id,
        data_inicio: ev.data_inicio,
        viaturas: ev.contratos.viaturas,
      }));

      const motIds = [
        ...new Set(
          contractItems
            .filter((i) => i.motorista_id)
            .map((i: any) => i.motorista_id as string)
        ),
      ];
      let nomeMap: Record<string, string> = {};
      if (motIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nome')
          .in('id', motIds);
        if (profiles) {
          nomeMap = Object.fromEntries(profiles.map((p: any) => [p.id, p.nome || '']));
        }
      }
      return contractItems.map((i: any) => ({
        ...i,
        motoristaNome: nomeMap[i.motorista_id] || '',
      })) as PendenteCheckout[];
    },
    enabled: open,
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

  const resetCheckout = () => {
    setSelected(null);
    setFiles([]);
    setCheckinDados(emptyCheckinDados);
    setDone(false);
  };

  const handleConfirm = async () => {
    if (!selected?.viaturas) return;
    const viatura = selected.viaturas;
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
      await saveCheckinDados({
        dados: checkinDados,
        contratoId: selected.id,
        viaturaId: viatura.id,
        userId,
        tipo: 'checkout',
        motoristaId: selected.motorista_id || undefined,
      });

      if (files.length > 0) {
        const records: any[] = [];
        for (const { file } of files) {
          const ext = file.name.split('.').pop() || 'bin';
          const path = `${selected.id}/checkout/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { error } = await supabase.storage
            .from('contrato-media')
            .upload(path, file, { contentType: file.type });
          if (error) throw error;
          records.push({
            contrato_id: selected.id,
            tipo: 'checkout',
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

      await supabase.from('contratos').update({ checkout_pendente: false }).eq('id', selected.id);

      // Espelha no calendário: encontra o evento 'entrega' legacy pendente
      // para esta matrícula e marca como realizado por este utilizador.
      // Limita-se a eventos sem origem_tipo (legacy) para não mexer nos
      // eventos do novo sistema de renting, que são tratados por trigger.
      if (selected.viaturas?.matricula) {
        const { data: evMatch } = await supabase
          .from('calendario_eventos')
          .select('id')
          .eq('tipo', 'entrega')
          .eq('matricula_devolver', selected.viaturas.matricula)
          .is('realizado_em', null)
          .is('origem_tipo', null)
          .order('data_inicio', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (evMatch?.id) {
          await supabase
            .from('calendario_eventos')
            .update({
              realizado_em: new Date().toISOString(),
              realizado_por_id: userId,
            })
            .eq('id', evMatch.id);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['contratos-checkout-pendentes'] });
      queryClient.invalidateQueries({ queryKey: ['viaturas-calendario'] });
      queryClient.invalidateQueries({ queryKey: ['calendario-eventos'] });

      const numStr = selected.numero_contrato
        ? `CT-${String(selected.numero_contrato).padStart(4, '0')}`
        : 'contrato';
      toast.success(`Check-out de ${numStr} confirmado`);
      setDone(true);
      setTimeout(() => resetCheckout(), 1200);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao confirmar check-out');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetCheckout();
    onOpenChange(v);
  };

  // ── Full-page checkout step ───────────────────────────────────────────────
  if (selected && open) {
    if (done) {
      return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4">
          <CheckCircle className="h-16 w-16 text-green-500" />
          <p className="text-xl font-semibold">Check-out confirmado!</p>
        </div>
      );
    }

    const viatura = selected.viaturas!;
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-card shrink-0">
          <Button variant="ghost" size="icon" onClick={resetCheckout} disabled={saving}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight">Check-out Pendente</h1>
            <p className="text-xs text-muted-foreground truncate">
              {formatMatricula(viatura.matricula)} — {viatura.marca} {viatura.modelo}
              {selected.motoristaNome && ` · ${selected.motoristaNome}`}
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
            <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-4 text-sm text-green-700 dark:text-green-300">
              <p className="font-medium">Check-out da viatura ao motorista.</p>
              <p className="mt-0.5 opacity-80 text-xs">
                Preencha as condições da viatura no momento da entrega.
              </p>
            </div>

            <CheckinDadosSection
              viaturaId={viatura.id}
              kmMinimo={viatura.km_atual ?? 0}
              dados={checkinDados}
              onChange={setCheckinDados}
              tipo="checkout"
              tipoCombustivel={viatura.combustivel ?? ''}
              motoristaNome={selected.motoristaNome}
              matricula={formatMatricula(viatura.matricula)}
              dataEvento={new Date().toISOString().slice(0, 10)}
              contratoNumero={selected.numero_contrato}
              accentClass="border-green-200 dark:border-green-800"
            />

            <div className="space-y-3">
              <p className="text-sm font-medium leading-none">
                Fotos / Vídeos{' '}
                <span className="text-muted-foreground font-normal text-xs">
                  (obrigatório se sem danos)
                </span>
              </p>
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

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            Check-outs Pendentes
            {pendentes.length + rentingEntregasPendentes.length > 0 && (
              <Badge className="bg-green-600 text-white">
                {pendentes.length + rentingEntregasPendentes.length}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendentes.length === 0 && rentingEntregasPendentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <CheckCircle className="h-10 w-10 opacity-30" />
              <p className="text-sm">Nenhum check-out pendente</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Pendentes de renting — mesma estética dos legacy. */}
              <RentingPendentesSection tipo="entrega" />
              {pendentes.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="rounded-lg p-2 bg-green-500/10 shrink-0">
                    <Car className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-semibold text-sm">
                      {c.viaturas ? formatMatricula(c.viaturas.matricula) : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.viaturas ? `${c.viaturas.marca} ${c.viaturas.modelo}` : ''}
                    </p>
                    {c.motoristaNome && (
                      <p className="text-xs text-muted-foreground/70 truncate">{c.motoristaNome}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400"
                    onClick={() => setSelected(c)}
                  >
                    Check-out
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
