import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarOff, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { validarNovoPeriodo, type PeriodoExistente } from '@/lib/gestorInatividade';
import type { DateRange } from '@/types/dateRange';

interface Periodo {
  id: string;
  data_inicio: string;
  data_fim: string;
  status: 'agendado' | 'ativo' | 'concluido' | 'cancelado';
}

const STATUS_LABEL: Record<Periodo['status'], string> = {
  agendado: 'Agendado',
  ativo: 'Ativo',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const STATUS_VARIANT: Record<Periodo['status'], 'default' | 'secondary' | 'outline'> = {
  agendado: 'secondary',
  ativo: 'default',
  concluido: 'outline',
  cancelado: 'outline',
};

function hojeISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function PeriodoInatividadeSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const criarLockRef = useRef(false);
  const cancelarLockRef = useRef(false);
  const terminarLockRef = useRef(false);

  const fetchPeriodos = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('gestor_periodos_inatividade')
      .select('id, data_inicio, data_fim, status')
      .eq('gestor_id', user.id)
      .order('data_inicio', { ascending: false });
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Erro ao carregar períodos de inatividade',
      });
    } else {
      // `status` é `text` com CHECK na BD (não um enum Postgres), por isso o
      // tipo gerado é `string`; o CHECK garante que só vêm os 4 valores da union.
      setPeriodos((data || []) as Periodo[]);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchPeriodos();
  }, [fetchPeriodos]);

  const handleCriar = async () => {
    if (criarLockRef.current) return;
    criarLockRef.current = true;

    if (!user || !range.from || !range.to) {
      criarLockRef.current = false;
      return;
    }

    const dataInicio = format(range.from, 'yyyy-MM-dd');
    const dataFim = format(range.to, 'yyyy-MM-dd');
    const hoje = hojeISO();
    const periodosExistentes: PeriodoExistente[] = periodos.map((p) => ({
      id: p.id,
      dataInicio: p.data_inicio,
      dataFim: p.data_fim,
      status: p.status,
    }));

    const validacao = validarNovoPeriodo({ dataInicio, dataFim, hoje, periodosExistentes });
    if (!validacao.valido) {
      toast({ variant: 'destructive', title: 'Datas inválidas', description: validacao.erro });
      criarLockRef.current = false;
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('gestor_periodos_inatividade')
        .insert({ gestor_id: user.id, data_inicio: dataInicio, data_fim: dataFim })
        .select('id')
        .single();

      if (error) throw error;

      if (dataInicio <= hoje) {
        const { error: invokeError } = await supabase.functions.invoke('process-gestor-inatividade', {
          body: { periodoId: data.id, forcar: 'ativar' },
        });
        if (invokeError) throw invokeError;
      }

      toast({ title: 'Período agendado', description: 'Período de inatividade guardado com sucesso.' });
      setRange({ from: undefined, to: undefined });
      setOpen(false);
      fetchPeriodos();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Erro ao agendar período',
      });
    } finally {
      setSubmitting(false);
      criarLockRef.current = false;
    }
  };

  const handleCancelar = async (id: string) => {
    if (cancelarLockRef.current) return;
    cancelarLockRef.current = true;

    setProcessingId(id);
    try {
      const { error } = await supabase
        .from('gestor_periodos_inatividade')
        .update({ status: 'cancelado' })
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Período cancelado' });
      fetchPeriodos();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Erro ao cancelar período',
      });
    } finally {
      setProcessingId(null);
      cancelarLockRef.current = false;
    }
  };

  const handleTerminarAgora = async (id: string) => {
    if (terminarLockRef.current) return;
    terminarLockRef.current = true;

    setProcessingId(id);
    try {
      const { error } = await supabase.functions.invoke('process-gestor-inatividade', {
        body: { periodoId: id, forcar: 'concluir' },
      });
      if (error) throw error;
      toast({ title: 'Período terminado', description: 'Foi marcado como disponível novamente.' });
      fetchPeriodos();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Erro ao terminar período',
      });
    } finally {
      setProcessingId(null);
      terminarLockRef.current = false;
    }
  };

  return (
    <div className="border-t pt-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <CalendarOff className="h-5 w-5 text-primary" />
          Período de Inatividade
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Agende um período em que vai estar indisponível como transferista. No dia de início os
          seus motoristas são avisados por email e fica bloqueado para novas atribuições até ao
          fim do período.
        </p>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline">Agendar novo período</Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <Calendar
            mode="range"
            selected={range.from ? { from: range.from, to: range.to } : undefined}
            onSelect={(value) => setRange(value ? { from: value.from, to: value.to } : { from: undefined, to: undefined })}
            numberOfMonths={2}
            defaultMonth={new Date()}
            disabled={{ before: new Date() }}
            initialFocus
          />
          <div className="flex justify-end pt-2">
            <Button onClick={handleCriar} disabled={submitting || !range.from || !range.to} size="sm">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : periodos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum período agendado.</p>
      ) : (
        <ul className="space-y-2">
          {periodos.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="flex items-center gap-3">
                <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                <span className="text-sm">
                  {new Date(p.data_inicio).toLocaleDateString('pt-PT')} –{' '}
                  {new Date(p.data_fim).toLocaleDateString('pt-PT')}
                </span>
              </div>
              {p.status === 'agendado' && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={processingId === p.id}
                  onClick={() => handleCancelar(p.id)}
                >
                  Cancelar
                </Button>
              )}
              {p.status === 'ativo' && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={processingId === p.id}
                  onClick={() => handleTerminarAgora(p.id)}
                >
                  Terminar agora
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
