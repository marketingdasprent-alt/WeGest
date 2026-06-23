import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Car,
  CalendarDays,
  MapPin,
  ArrowLeftRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMatricula } from './calendarioUtils';
import { DatePickerField, TimePickerField } from './calendarioPickers';
import type { CalendarioEvento } from '@/pages/Calendario';

interface Props {
  evento: CalendarioEvento;
  userId: string;
  onClose: () => void;
}

const TIPOS = [
  {
    value: 'entrega',
    label: 'Entrega',
    color: 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400',
    desc: 'Entregar viatura a um motorista',
  },
  {
    value: 'recolha',
    label: 'Recolha',
    color: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    desc: 'Motorista entrega a viatura — pendente chegada ao parque',
  },
  {
    value: 'devolucao',
    label: 'Devolução',
    color: 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400',
    desc: 'Viatura já entregue no parque — fica disponível imediatamente',
  },
  {
    value: 'troca',
    label: 'Troca',
    color: 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-400',
    desc: 'Substituir viatura para o mesmo motorista',
  },
  {
    value: 'upgrade',
    label: 'Upgrade / Downgrade',
    color: 'border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
    desc: 'Mudar categoria de viatura (impacto no dashboard)',
  },
  {
    value: 'lista_espera',
    label: 'Lista de Espera',
    color: 'border-pink-500 bg-pink-500/10 text-pink-700 dark:text-pink-400',
    desc: 'Reservar viatura — fica registada como reservada no calendário',
  },
];

function toLocalDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const EventoDialog: React.FC<Props> = ({ evento, userId, onClose }) => {
  const queryClient = useQueryClient();

  const [tipo, setTipo] = useState(evento.tipo);
  const [matricula, setMatricula] = useState(formatMatricula(evento.titulo));
  const [matriculaDevolver, setMatriculaDevolver] = useState(
    evento.matricula_devolver ? formatMatricula(evento.matricula_devolver) : ''
  );
  const [cidade, setCidade] = useState(evento.cidade || '');
  const [data, setData] = useState(toLocalDate(evento.data_inicio));
  const [hora, setHora] = useState(toLocalTime(evento.data_inicio));
  const [diaTodo, setDiaTodo] = useState(evento.dia_todo);
  const [observacoes, setObservacoes] = useState(evento.descricao || '');

  // Reset matriculaDevolver when changing away from troca/upgrade
  useEffect(() => {
    if (tipo !== 'troca' && tipo !== 'upgrade') setMatriculaDevolver('');
  }, [tipo]);

  const mutation = useMutation({
    mutationFn: async () => {
      const dataISO = diaTodo
        ? new Date(`${data}T00:00:00`).toISOString()
        : new Date(`${data}T${hora}:00`).toISOString();

      const payload: any = {
        titulo: matricula.toUpperCase().replace(/[-\s]/g, ''),
        cidade: cidade.trim() || null,
        tipo,
        data_inicio: dataISO,
        data_fim: null,
        dia_todo: diaTodo,
        descricao: observacoes.trim() || null,
        matricula_devolver:
          tipo === 'troca' || tipo === 'upgrade'
            ? matriculaDevolver.toUpperCase().replace(/[-\s]/g, '') || null
            : null,
      };

      // Record changes for history
      const changes: { campo: string; valor_anterior: string | null; valor_novo: string | null }[] =
        [];
      const compare = (campo: string, oldVal: any, newVal: any) => {
        const o = oldVal == null ? null : String(oldVal);
        const n = newVal == null ? null : String(newVal);
        if (o !== n) changes.push({ campo, valor_anterior: o, valor_novo: n });
      };
      compare('titulo', evento.titulo, payload.titulo);
      compare('cidade', evento.cidade, payload.cidade);
      compare('tipo', evento.tipo, payload.tipo);
      compare('data_inicio', evento.data_inicio, payload.data_inicio);
      compare('dia_todo', evento.dia_todo, payload.dia_todo);
      compare('descricao', evento.descricao, payload.descricao);
      compare('matricula_devolver', evento.matricula_devolver, payload.matricula_devolver);

      const { error } = await supabase
        .from('calendario_eventos')
        .update(payload)
        .eq('id', evento.id);
      if (error) throw error;

      if (changes.length > 0) {
        await supabase.from('calendario_eventos_historico').insert(
          changes.map((c) => ({
            evento_id: evento.id,
            editado_por: userId,
            campo: c.campo,
            valor_anterior: c.valor_anterior,
            valor_novo: c.valor_novo,
          }))
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendario-eventos'] });
      toast.success('Evento actualizado');
      onClose();
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao guardar evento'),
  });

  const canSave = !!matricula.trim() && !!data;
  const tipoInfo = TIPOS.find((t) => t.value === tipo);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-card shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold leading-tight">Editar Evento</h1>
          {tipoInfo && <p className="text-xs text-muted-foreground truncate">{tipoInfo.desc}</p>}
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!canSave || mutation.isPending}
          className="shrink-0"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar...
            </>
          ) : (
            'Guardar'
          )}
        </Button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Banner de realização — preenchido pelo trigger quando alguém
              executa a entrega/recolha. Só aparece se evento foi realizado. */}
          {evento.realizado_em && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">Evento realizado</p>
                <p>
                  Por <span className="font-medium">{evento.realizador?.nome ?? '—'}</span> em{' '}
                  {new Date(evento.realizado_em).toLocaleString('pt-PT', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          )}

          {/* Tipo de Evento */}
          <div className="space-y-2">
            <Label>Tipo de Evento</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TIPOS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTipo(t.value)}
                  className={cn(
                    'rounded-lg border-2 px-3 py-2.5 text-left transition-all text-sm',
                    tipo === t.value
                      ? t.color + ' font-semibold'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50 text-foreground'
                  )}
                >
                  <div className="font-medium">{t.label}</div>
                  <div
                    className={cn(
                      'text-xs mt-0.5 leading-tight',
                      tipo === t.value ? 'opacity-80' : 'text-muted-foreground'
                    )}
                  >
                    {t.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Viatura */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" />
              Viatura
            </h2>

            <div className="space-y-1.5">
              <Label htmlFor="matricula">
                {tipo === 'troca' || tipo === 'upgrade' ? 'Matrícula nova' : 'Matrícula'}
              </Label>
              <Input
                id="matricula"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value.toUpperCase())}
                placeholder="Ex: AA-00-AA"
                className="font-mono"
              />
            </div>

            {(tipo === 'troca' || tipo === 'upgrade') && (
              <div className="space-y-1.5">
                <Label htmlFor="matricula-devolver" className="flex items-center gap-1.5">
                  <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
                  Matrícula a devolver
                </Label>
                <Input
                  id="matricula-devolver"
                  value={matriculaDevolver}
                  onChange={(e) => setMatriculaDevolver(e.target.value.toUpperCase())}
                  placeholder="Ex: AA-00-AA"
                  className="font-mono"
                />
              </div>
            )}
          </div>

          {/* Data e Localização */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Data e Localização
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center h-5">
                  <Label htmlFor="data">
                    Data <span className="text-red-500">*</span>
                  </Label>
                </div>
                <DatePickerField id="data" value={data} onChange={setData} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 h-5">
                  <Label htmlFor="hora">Hora</Label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={diaTodo}
                      onChange={(e) => setDiaTodo(e.target.checked)}
                      className="rounded"
                    />
                    Dia inteiro
                  </label>
                </div>
                <TimePickerField value={hora} onChange={setHora} disabled={diaTodo} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cidade" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                Cidade
              </Label>
              <Input
                id="cidade"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="Ex: Lisboa, Porto, Faro..."
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações</Label>
            <Textarea
              id="obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas adicionais sobre este evento..."
              rows={3}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
