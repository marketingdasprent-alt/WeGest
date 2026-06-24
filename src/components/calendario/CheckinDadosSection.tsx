import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Battery,
  Camera,
  Film,
  Gauge,
  Plus,
  Printer,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import {
  precisaCombustivel,
  precisaEletrico,
  precisaGpl,
  ELETRICO_OPTS,
  GPL_OPTS,
  COMBUSTIVEL_NIVEL_OPTS as COMBUSTIVEL_OPTS,
} from '@/utils/combustivel';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NovoDanoState {
  id: string;
  descricao: string;
  localizacao: string;
  files: { id: string; file: File; preview: string | null }[];
}

export interface CheckinDadosState {
  km: string;
  combustivel: string;
  nivelEletrico: string;
  nivelGpl: string;
  novosDanos: NovoDanoState[];
}

export function emptyCheckinDados(): CheckinDadosState {
  return { km: '', combustivel: '', nivelEletrico: '', nivelGpl: '', novosDanos: [] };
}

export function validateCheckinDados(
  dados: CheckinDadosState,
  kmMinimo: number,
  tipoCombustivel = ''
): string | null {
  if (!dados.km.trim() || isNaN(Number(dados.km))) return 'KM atual é obrigatório';
  if (Number(dados.km) < kmMinimo)
    return `KM não pode ser inferior a ${kmMinimo.toLocaleString()} km (registo atual da viatura)`;
  if (precisaCombustivel(tipoCombustivel) && !dados.combustivel)
    return 'Nível de combustível é obrigatório';
  if (precisaEletrico(tipoCombustivel) && !dados.nivelEletrico)
    return 'Nível de bateria elétrica é obrigatório';
  if (precisaGpl(tipoCombustivel) && !dados.nivelGpl) return 'Nível de GPL é obrigatório';
  for (const d of dados.novosDanos) {
    if (!d.descricao.trim()) return 'Todos os danos adicionados devem ter descrição';
  }
  return null;
}

interface SaveParams {
  dados: CheckinDadosState;
  contratoId: string;
  viaturaId: string;
  userId: string;
  tipo: 'checkout' | 'checkin';
  motoristaId?: string;
}

export async function saveCheckinDados({
  dados,
  contratoId,
  viaturaId,
  userId,
  tipo,
  motoristaId,
}: SaveParams) {
  const kmNum = Number(dados.km);
  const isOut = tipo === 'checkout';

  // 1. Atualizar contrato com km, combustivel, eletricidade, gpl
  const field = isOut
    ? {
        km_checkout: kmNum,
        combustivel_checkout: dados.combustivel || null,
        eletricidade_checkout: dados.nivelEletrico || null,
        gpl_checkout: dados.nivelGpl || null,
      }
    : {
        km_checkin: kmNum,
        combustivel_checkin: dados.combustivel || null,
        eletricidade_checkin: dados.nivelEletrico || null,
        gpl_checkin: dados.nivelGpl || null,
      };
  await supabase.from('contratos').update(field).eq('id', contratoId);

  // 2. Atualizar km_atual da viatura
  await supabase.from('viaturas').update({ km_atual: kmNum }).eq('id', viaturaId);

  // 3. Guardar novos danos + fotos (ligados à viatura, contrato E motorista)
  for (const dano of dados.novosDanos) {
    if (!dano.descricao.trim()) continue;
    const { data: newDano, error: dErr } = await supabase
      .from('viatura_danos')
      .insert({
        viatura_id: viaturaId,
        descricao: dano.descricao.trim(),
        localizacao: dano.localizacao.trim() || null,
        estado: 'pendente',
        registado_por: userId,
        contrato_id: contratoId,
        contrato_id_origem: contratoId,
        motorista_id: motoristaId || null,
      })
      .select('id')
      .single();
    if (dErr) throw dErr;

    for (const { file } of dano.files) {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${newDano.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('viatura-danos')
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      await supabase.from('viatura_dano_fotos').insert({
        dano_id: newDano.id,
        ficheiro_url: path,
        nome_ficheiro: file.name,
        uploaded_by: userId,
        contrato_id: contratoId,
      });
    }
  }
}

// ── Folha de Danos PDF ────────────────────────────────────────────────────────

interface DanoExistente {
  id: string;
  descricao: string;
  localizacao: string | null;
  estado: string;
  data_registo: string;
}

interface FolhaDanosParams {
  matricula: string;
  motoristaNome: string;
  tipo: 'checkout' | 'checkin';
  tipoCombustivel?: string;
  km: string;
  combustivel: string;
  nivelEletrico: string;
  nivelGpl: string;
  danosExistentes: DanoExistente[];
  novosDanos: NovoDanoState[];
  dataEvento: string;
  contratoNumero?: number | null;
  existingPdf?: jsPDF;
}

export function gerarFolhaDanos(p: FolhaDanosParams) {
  const doc = p.existingPdf || new jsPDF({ unit: 'mm', format: 'a4' });
  if (p.existingPdf) doc.addPage();
  const W = 210;
  let y = 20;

  const line = (x1: number, y1: number, x2: number, y2: number) => doc.line(x1, y1, x2, y2);
  const text = (t: string, x: number, yy: number, opts?: any) => {
    doc.text(t, x, yy, opts);
  };

  // Header
  doc.setFillColor(30, 30, 30);
  doc.rect(0, 0, W, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  text('FOLHA DE DANOS — WeGest', W / 2, 9, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  y = 22;

  // Subtitle
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  const tipoLabel = p.tipo === 'checkout' ? 'ENTREGA DE VIATURA' : 'DEVOLUÇÃO DE VIATURA';
  text(tipoLabel, W / 2, y, { align: 'center' });
  y += 8;

  // Info box — calculate height based on fuel types shown
  const tc = (p.tipoCombustivel || '').toLowerCase();
  const mostraCombustivel = precisaCombustivel(tc);
  const mostraEletrico = precisaEletrico(tc);
  const mostraGpl = precisaGpl(tc);
  const energyRows = (mostraCombustivel ? 1 : 0) + (mostraEletrico ? 1 : 0) + (mostraGpl ? 1 : 0);
  const boxH = 14 + energyRows * 7;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setFillColor(245, 245, 245);
  doc.rect(14, y, W - 28, boxH, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.rect(14, y, W - 28, boxH, 'S');

  const col1 = 18;
  const col2 = 110;
  y += 6;

  // Row 1: Viatura + Data
  doc.setFont('helvetica', 'bold');
  text('Viatura:', col1, y);
  doc.setFont('helvetica', 'normal');
  text(p.matricula, col1 + 20, y);
  doc.setFont('helvetica', 'bold');
  text('Data:', col2, y);
  doc.setFont('helvetica', 'normal');
  text(p.dataEvento, col2 + 15, y);
  y += 7;

  // Row 2: Motorista + Contrato
  doc.setFont('helvetica', 'bold');
  text('Motorista:', col1, y);
  doc.setFont('helvetica', 'normal');
  text(p.motoristaNome || '—', col1 + 24, y);
  doc.setFont('helvetica', 'bold');
  text('Contrato:', col2, y);
  doc.setFont('helvetica', 'normal');
  text(
    p.contratoNumero != null ? `CT-${String(p.contratoNumero).padStart(4, '0')}` : '—',
    col2 + 24,
    y
  );
  y += 7;

  // Row 3+: Energy levels
  if (mostraCombustivel) {
    doc.setFont('helvetica', 'bold');
    text('Combustível:', col1, y);
    doc.setFont('helvetica', 'normal');
    text(p.combustivel || '—', col1 + 30, y);
    if (mostraGpl) {
      doc.setFont('helvetica', 'bold');
      text('GPL:', col2, y);
      doc.setFont('helvetica', 'normal');
      text(p.nivelGpl || '—', col2 + 15, y);
    }
    y += 7;
  }
  if (mostraEletrico) {
    doc.setFont('helvetica', 'bold');
    text(mostraCombustivel ? 'Bateria:' : 'Elétrico:', col1, y);
    doc.setFont('helvetica', 'normal');
    text(p.nivelEletrico || '—', col1 + (mostraCombustivel ? 22 : 24), y);
    y += 7;
  }
  if (mostraGpl && !mostraCombustivel) {
    doc.setFont('helvetica', 'bold');
    text('GPL:', col1, y);
    doc.setFont('helvetica', 'normal');
    text(p.nivelGpl || '—', col1 + 15, y);
    y += 7;
  }

  // KM always at the end of the box
  doc.setFont('helvetica', 'bold');
  text('KM:', col1, y);
  doc.setFont('helvetica', 'normal');
  text(`${Number(p.km || 0).toLocaleString()} km`, col1 + 12, y);
  y += 10;

  // Statement + damages table
  const allDanos = [
    ...p.danosExistentes.map((d) => ({
      descricao: d.descricao,
      localizacao: d.localizacao,
      novo: false,
    })),
    ...p.novosDanos.map((d) => ({
      descricao: d.descricao,
      localizacao: d.localizacao,
      novo: true,
    })),
  ];

  if (allDanos.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    text('Nenhum dano registado na viatura.', 14, y);
    doc.setTextColor(0, 0, 0);
    y += 8;
  } else {
    const statement =
      p.tipo === 'checkout'
        ? `O motorista ${p.motoristaNome || '(sem nome)'} confirma receber a viatura ${p.matricula} com os seguintes danos previamente registados:`
        : `O motorista ${p.motoristaNome || '(sem nome)'} confirma devolver a viatura ${p.matricula} com os seguintes danos registados:`;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(statement, W - 28) as string[];
    doc.text(lines, 14, y);
    y += lines.length * 5 + 4;

    doc.setFillColor(50, 50, 50);
    doc.rect(14, y, W - 28, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    text('#', 17, y + 5);
    text('Descrição do Dano', 25, y + 5);
    text('Localização', 130, y + 5);
    text('Estado', 170, y + 5);
    y += 7;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    allDanos.forEach((d, i) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }
      const bg = i % 2 === 0 ? [255, 255, 255] : [248, 248, 248];
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.rect(14, y, W - 28, 7, 'F');
      doc.setDrawColor(220, 220, 220);
      doc.rect(14, y, W - 28, 7, 'S');
      doc.setFontSize(8);
      text(String(i + 1), 17, y + 5);
      const descLines = doc.splitTextToSize(d.descricao, 100) as string[];
      text(descLines[0], 25, y + 5);
      text(d.localizacao || '—', 130, y + 5);
      if (d.novo) {
        doc.setTextColor(200, 50, 50);
        text('NOVO', 170, y + 5);
        doc.setTextColor(0, 0, 0);
      } else {
        text('Existente', 170, y + 5);
      }
      y += 7;
    });
  }

  y += 14;
  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  doc.setDrawColor(0);
  line(14, y, 90, y);
  line(120, y, 196, y);
  y += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  text('Assinatura do Motorista', 14, y);
  text('Assinatura do Responsável', 120, y);

  if (!p.existingPdf) {
    doc.save(`folha-danos-${p.matricula.replace(/[^A-Z0-9]/gi, '')}-${p.dataEvento}.pdf`);
  }
  return doc;
}

// ── UI Component ──────────────────────────────────────────────────────────────

interface CheckinDadosSectionProps {
  viaturaId: string;
  kmMinimo: number;
  dados: CheckinDadosState;
  onChange: (d: CheckinDadosState) => void;
  tipo: 'checkout' | 'checkin';
  tipoCombustivel?: string;
  motoristaNome?: string;
  matricula?: string;
  dataEvento?: string;
  contratoNumero?: number | null;
  accentClass?: string;
}

export const CheckinDadosSection: React.FC<CheckinDadosSectionProps> = ({
  viaturaId,
  kmMinimo,
  dados,
  onChange,
  tipo,
  tipoCombustivel = '',
  motoristaNome = '',
  matricula = '',
  dataEvento = '',
  contratoNumero,
  accentClass = 'border-gray-200 dark:border-gray-700',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeDanoId, setActiveDanoId] = useState<string | null>(null);

  const tc = tipoCombustivel.toLowerCase();
  const mostraCombustivel = precisaCombustivel(tc);
  const mostraEletrico = precisaEletrico(tc);
  const mostraGpl = precisaGpl(tc);

  const { data: danosExistentes = [] } = useQuery({
    queryKey: ['viatura-danos-ativos', viaturaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viatura_danos')
        .select('id, descricao, localizacao, estado, data_registo')
        .eq('viatura_id', viaturaId)
        .neq('estado', 'reparado')
        .order('data_registo', { ascending: false });
      if (error) throw error;
      return data as {
        id: string;
        descricao: string;
        localizacao: string | null;
        estado: string;
        data_registo: string;
      }[];
    },
    enabled: !!viaturaId,
  });

  const set = (partial: Partial<CheckinDadosState>) => onChange({ ...dados, ...partial });

  const addDano = () => {
    const novo: NovoDanoState = {
      id: Math.random().toString(36).slice(2),
      descricao: '',
      localizacao: '',
      files: [],
    };
    set({ novosDanos: [...dados.novosDanos, novo] });
    setActiveDanoId(novo.id);
  };

  const updateDano = (id: string, partial: Partial<NovoDanoState>) => {
    set({ novosDanos: dados.novosDanos.map((d) => (d.id === id ? { ...d, ...partial } : d)) });
  };

  const removeDano = (id: string) => {
    set({ novosDanos: dados.novosDanos.filter((d) => d.id !== id) });
  };

  const addFilesToDano = (id: string, newFiles: FileList | null) => {
    if (!newFiles) return;
    const mapped = Array.from(newFiles).map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
    }));
    updateDano(id, {
      files: [...(dados.novosDanos.find((d) => d.id === id)?.files || []), ...mapped],
    });
  };

  const removeFileFromDano = (danoId: string, fileId: string) => {
    const dano = dados.novosDanos.find((d) => d.id === danoId);
    if (!dano) return;
    const f = dano.files.find((x) => x.id === fileId);
    if (f?.preview) URL.revokeObjectURL(f.preview);
    updateDano(danoId, { files: dano.files.filter((x) => x.id !== fileId) });
  };

  const handlePrintFolha = () => {
    const error = validateCheckinDados(dados, kmMinimo, tipoCombustivel);
    if (error) {
      toast.error(error);
      return;
    }
    gerarFolhaDanos({
      matricula,
      motoristaNome,
      tipo,
      tipoCombustivel,
      km: dados.km,
      combustivel: dados.combustivel,
      nivelEletrico: dados.nivelEletrico,
      nivelGpl: dados.nivelGpl,
      danosExistentes,
      novosDanos: dados.novosDanos,
      dataEvento,
      contratoNumero,
    });
  };

  const kmNum = Number(dados.km);
  const kmInvalid = dados.km !== '' && !isNaN(kmNum) && kmNum < kmMinimo;

  // Reusable button-group selector
  const LevelSelector = ({
    label,
    icon,
    opts,
    value,
    onSelect,
    required,
  }: {
    label: string;
    icon: React.ReactNode;
    opts: readonly string[];
    value: string;
    onSelect: (v: string) => void;
    required?: boolean;
  }) => (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1">
        {icon}
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="flex rounded-md border border-input overflow-hidden h-9">
        {opts.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(opt)}
            className={cn(
              'flex-1 text-[10px] font-medium transition-colors border-r border-input last:border-r-0',
              value === opt
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted text-foreground'
            )}
          >
            {opt === 'Vazio' ? <Zap className="h-3 w-3 mx-auto opacity-50" /> : opt}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className={cn('rounded-lg border p-4 space-y-4', accentClass)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          Condição da Viatura
          {tipo === 'checkout' ? ' — Checkout' : ' — Checkin'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={handlePrintFolha}
        >
          <Printer className="h-3.5 w-3.5" />
          Folha de Danos
        </Button>
      </div>

      {/* KM */}
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1">
          KM Atual <span className="text-red-500">*</span>
          {kmMinimo > 0 && (
            <span className="text-muted-foreground font-normal">
              (mín. {kmMinimo.toLocaleString()})
            </span>
          )}
        </Label>
        <Input
          type="number"
          min={kmMinimo}
          value={dados.km}
          onChange={(e) => set({ km: e.target.value })}
          placeholder={kmMinimo > 0 ? String(kmMinimo) : '0'}
          className={cn(
            'h-9 text-sm',
            kmInvalid && 'border-destructive focus-visible:ring-destructive'
          )}
        />
        {kmInvalid && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> KM inferior ao registo da viatura (
            {kmMinimo.toLocaleString()})
          </p>
        )}
      </div>

      {/* Energy levels based on fuel type */}
      <div
        className={cn(
          'grid gap-3',
          (mostraCombustivel && mostraEletrico) || (mostraCombustivel && mostraGpl)
            ? 'grid-cols-1'
            : 'grid-cols-1'
        )}
      >
        {mostraCombustivel && (
          <LevelSelector
            label="Combustível"
            icon={<Gauge className="h-3 w-3" />}
            opts={COMBUSTIVEL_OPTS}
            value={dados.combustivel}
            onSelect={(v) => set({ combustivel: v })}
            required
          />
        )}
        {mostraGpl && (
          <LevelSelector
            label="Nível GPL"
            icon={<Zap className="h-3 w-3 text-orange-500" />}
            opts={GPL_OPTS}
            value={dados.nivelGpl}
            onSelect={(v) => set({ nivelGpl: v })}
            required
          />
        )}
        {mostraEletrico && (
          <LevelSelector
            label="Bateria Elétrica"
            icon={<Battery className="h-3 w-3 text-green-500" />}
            opts={ELETRICO_OPTS}
            value={dados.nivelEletrico}
            onSelect={(v) => set({ nivelEletrico: v })}
            required
          />
        )}
      </div>

      {/* Danos existentes */}
      {danosExistentes.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            Danos existentes na viatura ({danosExistentes.length})
          </Label>
          <div className="rounded-md border border-amber-200 dark:border-amber-800 divide-y divide-amber-100 dark:divide-amber-900">
            {danosExistentes.map((d) => (
              <div key={d.id} className="px-3 py-2 text-xs bg-amber-50/50 dark:bg-amber-950/20">
                <span className="font-medium text-amber-800 dark:text-amber-300">
                  {d.descricao}
                </span>
                {d.localizacao && (
                  <span className="text-muted-foreground ml-2">— {d.localizacao}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Novos danos */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Registar Novos Danos</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={addDano}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar Dano
          </Button>
        </div>

        {dados.novosDanos.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Nenhum novo dano. Clique em "Adicionar Dano" se encontrar algum.
          </p>
        )}

        {dados.novosDanos.map((dano) => (
          <div
            key={dano.id}
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <Input
                value={dano.descricao}
                onChange={(e) => updateDano(dano.id, { descricao: e.target.value })}
                placeholder="Descrição do dano *"
                className="h-8 text-xs flex-1"
              />
              <Input
                value={dano.localizacao}
                onChange={(e) => updateDano(dano.id, { localizacao: e.target.value })}
                placeholder="Localização (ex: para-choque)"
                className="h-8 text-xs flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive"
                onClick={() => removeDano(dano.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                ref={activeDanoId === dano.id ? fileInputRef : undefined}
                onChange={(e) => {
                  addFilesToDano(dano.id, e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                type="file"
                accept="image/*,video/*"
                capture="environment"
                className="hidden"
                ref={activeDanoId === dano.id ? cameraInputRef : undefined}
                onChange={(e) => {
                  addFilesToDano(dano.id, e.target.files);
                  e.target.value = '';
                }}
              />
              <p className="text-[10px] text-muted-foreground mb-1">Fotos e vídeos (opcional)</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveDanoId(dano.id);
                    setTimeout(() => cameraInputRef.current?.click(), 50);
                  }}
                  className="rounded border border-dashed border-destructive/40 py-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:bg-destructive/5 transition-colors"
                >
                  <Camera className="h-3.5 w-3.5" /> Câmara
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveDanoId(dano.id);
                    setTimeout(() => fileInputRef.current?.click(), 50);
                  }}
                  className="rounded border border-dashed border-destructive/40 py-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:bg-destructive/5 transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" /> Galeria
                </button>
              </div>

              {dano.files.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                  {dano.files.map((f) => (
                    <div
                      key={f.id}
                      className="relative rounded overflow-hidden border border-border aspect-square bg-muted"
                    >
                      {f.preview ? (
                        <img
                          src={f.preview}
                          alt={f.file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full">
                          <Film className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFileFromDano(dano.id, f.id)}
                        className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
