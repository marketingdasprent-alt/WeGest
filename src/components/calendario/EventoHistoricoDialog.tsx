import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, User, History } from 'lucide-react';
import { formatMatricula } from './EventoCard';
import { TIPO_LABELS, TIPO_ACCENT_COLORS, TIPO_TITLE_COLORS } from './eventoTipoConfig';
import type { CalendarioEvento } from '@/pages/Calendario';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evento: CalendarioEvento | null;
}

const CAMPO_LABELS: Record<string, string> = {
  titulo: 'Matrícula',
  cidade: 'Cidade',
  tipo: 'Tipo',
  data_inicio: 'Data início',
  data_fim: 'Data fim',
  dia_todo: 'Dia inteiro',
  descricao: 'Observações',
  matricula_devolver: 'Mat. a Devolver',
};

function formatValue(campo: string, valor: string | null): string {
  if (!valor || valor === 'null') return '—';
  if (campo === 'tipo') return TIPO_LABELS[valor] || valor;
  if (campo === 'dia_todo') return valor === 'true' ? 'Sim' : 'Não';
  if (campo === 'titulo' || campo === 'matricula_devolver') return formatMatricula(valor);
  if (campo.startsWith('data_')) {
    try {
      return format(new Date(valor), 'dd/MM/yyyy HH:mm', { locale: pt });
    } catch {
      return valor;
    }
  }
  return valor;
}

export const EventoHistoricoDialog: React.FC<Props> = ({ open, onOpenChange, evento }) => {
  const { data: historico = [], isLoading } = useQuery({
    queryKey: ['calendario-historico', evento?.id],
    enabled: open && !!evento,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendario_eventos_historico')
        .select('*')
        .eq('evento_id', evento!.id)
        .order('editado_em', { ascending: false });

      if (error) throw error;

      // Fetch editor names
      const editorIds = [...new Set((data || []).map((h) => h.editado_por))];
      let namesMap: Record<string, string> = {};
      if (editorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nome')
          .in('id', editorIds);
        if (profiles) {
          namesMap = Object.fromEntries(profiles.map((p) => [p.id, p.nome || 'Utilizador']));
        }
      }

      return (data || []).map((h) => ({
        ...h,
        editor_nome: namesMap[h.editado_por] || 'Utilizador',
      }));
    },
  });

  if (!evento) return null;

  const tituloColor = TIPO_TITLE_COLORS[evento.tipo] || TIPO_TITLE_COLORS.entrega;
  const accentColor = TIPO_ACCENT_COLORS[evento.tipo] || TIPO_ACCENT_COLORS.entrega;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${tituloColor}`}>
            <History className="h-5 w-5" />
            Detalhes do Evento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className={`border-2 rounded-lg p-3 space-y-1 ${accentColor}`}>
            <p>
              <span className="font-medium">
                {evento.tipo === 'troca' ? 'Mat. a Entregar:' : 'Matrícula:'}
              </span>{' '}
              {formatMatricula(evento.titulo)}
            </p>
            {evento.matricula_devolver && (
              <p>
                <span className="font-medium">Mat. a Devolver:</span>{' '}
                {formatMatricula(evento.matricula_devolver)}
              </p>
            )}
            {evento.cidade && (
              <p>
                <span className="font-medium">Cidade:</span> {evento.cidade.toUpperCase()}
              </p>
            )}
            <p>
              <span className="font-medium">Tipo:</span> {TIPO_LABELS[evento.tipo] || evento.tipo}
            </p>
            {evento.descricao && (
              <p>
                <span className="font-medium">Observações:</span> {evento.descricao}
              </p>
            )}
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                {format(new Date(evento.data_inicio), 'dd/MM/yyyy HH:mm', { locale: pt })}
              </span>
            </div>
            {evento.profiles?.nome && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <User className="h-3 w-3" />
                <span>Criado por {evento.profiles.nome}</span>
              </div>
            )}
          </div>

          <h3 className="font-semibold text-sm pt-2">Histórico de edições</h3>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : historico.length === 0 ? (
            <p className="text-muted-foreground text-xs">Este evento ainda não foi editado.</p>
          ) : (
            <div className="space-y-2">
              {historico.map((h) => (
                <div key={h.id} className="border rounded-md p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{h.editor_nome}</span>
                    <span className="text-muted-foreground">
                      {format(new Date(h.editado_em), 'dd/MM HH:mm', { locale: pt })}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {CAMPO_LABELS[h.campo] || h.campo}:
                    </span>{' '}
                    <span className="line-through">{formatValue(h.campo, h.valor_anterior)}</span>
                    {' → '}
                    <span className="text-foreground">{formatValue(h.campo, h.valor_novo)}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
