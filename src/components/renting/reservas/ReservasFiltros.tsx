import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReservaEstado } from '@/types/reserva';
import type { Estacao } from '@/hooks/useEstacoes';

export type EstadoFilterValue = 'todos' | ReservaEstado;

export interface ReservasFiltrosState {
  estacao: string;
  dataInicio: string;
  dataFim: string;
  estado: EstadoFilterValue;
}

interface ReservasFiltrosProps {
  estacoes: Estacao[];
  state: ReservasFiltrosState;
  onChange: (next: ReservasFiltrosState) => void;
  onClear: () => void;
}

export const ReservasFiltros: React.FC<ReservasFiltrosProps> = ({
  estacoes,
  state,
  onChange,
  onClear,
}) => {
  const hasActive =
    state.estacao !== 'todas' || !!state.dataInicio || !!state.dataFim || state.estado !== 'todos';

  const update = <K extends keyof ReservasFiltrosState>(key: K, value: ReservasFiltrosState[K]) =>
    onChange({ ...state, [key]: value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 p-3 border-b border-border/50 items-end">
      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Estação
        </label>
        <Select value={state.estacao} onValueChange={(v) => update('estacao', v)}>
          <SelectTrigger className="h-9 bg-background">
            <SelectValue placeholder="Todas as estações" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as estações</SelectItem>
            {estacoes.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Data Início
        </label>
        <Input
          type="date"
          value={state.dataInicio}
          onChange={(e) => update('dataInicio', e.target.value)}
          className="h-9 bg-background"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Data Fim
        </label>
        <Input
          type="date"
          value={state.dataFim}
          onChange={(e) => update('dataFim', e.target.value)}
          className="h-9 bg-background"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Estado
        </label>
        <div className="flex gap-2">
          <Select
            value={state.estado}
            onValueChange={(v) => update('estado', v as EstadoFilterValue)}
          >
            <SelectTrigger className="h-9 bg-background flex-1">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="confirmada">Confirmada</SelectItem>
              <SelectItem value="em_curso">Em Contrato</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          {hasActive && (
            <Button
              variant="outline"
              size="icon"
              onClick={onClear}
              title="Limpar filtros"
              className="h-9 w-9 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
