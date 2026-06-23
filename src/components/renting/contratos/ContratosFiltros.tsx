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
import type { ContratoEstadoOperacional, ContratoEstadoFinanceiro } from '@/types/contratoRenting';
import type { Estacao } from '@/hooks/useEstacoes';

export type EstadoOpFilter = 'todos' | ContratoEstadoOperacional;
export type EstadoFinFilter = 'todos' | ContratoEstadoFinanceiro;

export interface ContratosFiltrosState {
  codigo: string;
  estacao: string;
  dataInicio: string;
  dataFim: string;
  estadoOp: EstadoOpFilter;
  estadoFin: EstadoFinFilter;
}

interface ContratosFiltrosProps {
  estacoes: Estacao[];
  state: ContratosFiltrosState;
  onChange: (next: ContratosFiltrosState) => void;
  onClear: () => void;
}

export const ContratosFiltros: React.FC<ContratosFiltrosProps> = ({
  estacoes,
  state,
  onChange,
  onClear,
}) => {
  const hasActive =
    !!state.codigo ||
    state.estacao !== 'todas' ||
    !!state.dataInicio ||
    !!state.dataFim ||
    state.estadoOp !== 'todos' ||
    state.estadoFin !== 'todos';

  const update = <K extends keyof ContratosFiltrosState>(key: K, value: ContratosFiltrosState[K]) =>
    onChange({ ...state, [key]: value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 p-3 border-b border-border/50 items-end">
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
          Estado Operacional
        </label>
        <Select
          value={state.estadoOp}
          onValueChange={(v) => update('estadoOp', v as EstadoOpFilter)}
        >
          <SelectTrigger className="h-9 bg-background">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="agendado">Agendado</SelectItem>
            <SelectItem value="em_curso">Em Curso</SelectItem>
            <SelectItem value="devolvido">Devolvido</SelectItem>
            <SelectItem value="cancelado">Fechado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Estado Financeiro
        </label>
        <div className="flex gap-2">
          <Select
            value={state.estadoFin}
            onValueChange={(v) => update('estadoFin', v as EstadoFinFilter)}
          >
            <SelectTrigger className="h-9 bg-background flex-1">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="facturado">Facturado</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="anulado">Anulado</SelectItem>
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
