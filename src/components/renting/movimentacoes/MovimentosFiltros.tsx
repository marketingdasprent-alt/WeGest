import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MOVIMENTO_ESTADO_LABELS,
  MOVIMENTO_ESTADOS,
  type MovimentoEstado,
  type MovimentoTipo,
} from '@/types/movimento';
import type { Estacao } from '@/hooks/useEstacoes';

export interface MovimentosFiltrosState {
  codigo: string;
  tipo: 'todos' | MovimentoTipo;
  estado: 'todos' | MovimentoEstado;
  estacao: string;
}

interface MovimentosFiltrosProps {
  estacoes: Estacao[];
  state: MovimentosFiltrosState;
  onChange: (next: MovimentosFiltrosState) => void;
  onClear: () => void;
}

export const MovimentosFiltros: React.FC<MovimentosFiltrosProps> = ({
  estacoes,
  state,
  onChange,
  onClear,
}) => {
  const hasActive = !!state.codigo || state.estado !== 'todos' || state.estacao !== 'todas';

  const update = <K extends keyof MovimentosFiltrosState>(
    key: K,
    value: MovimentosFiltrosState[K]
  ) => onChange({ ...state, [key]: value });

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-3 border-b border-border/50 items-end">
      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Código
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={state.codigo}
            onChange={(e) => update('codigo', e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="pl-8 h-9 bg-background"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Estação
        </label>
        <Select value={state.estacao} onValueChange={(v) => update('estacao', v)}>
          <SelectTrigger className="h-9 bg-background">
            <SelectValue />
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
          Estado
        </label>
        <div className="flex gap-2">
          <Select
            value={state.estado}
            onValueChange={(v) => update('estado', v as MovimentosFiltrosState['estado'])}
          >
            <SelectTrigger className="h-9 bg-background flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {MOVIMENTO_ESTADOS.map((e) => (
                <SelectItem key={e} value={e}>
                  {MOVIMENTO_ESTADO_LABELS[e]}
                </SelectItem>
              ))}
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
