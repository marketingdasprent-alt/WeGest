import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FiltrosPedidos } from '@/utils/filtrarPedidos';

interface PedidosHistoricoFiltrosProps {
  filtros: FiltrosPedidos;
  onChange: (filtros: FiltrosPedidos) => void;
}

export function PedidosHistoricoFiltros({ filtros, onChange }: PedidosHistoricoFiltrosProps) {
  const alterar = (parcial: Partial<FiltrosPedidos>) => onChange({ ...filtros, ...parcial });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Pesquisar pedidos"
          placeholder="Contrato ou motivo"
          value={filtros.pesquisa}
          onChange={(e) => alterar({ pesquisa: e.target.value })}
          className="pl-9 w-56"
        />
      </div>
      <Select
        value={filtros.tipo}
        onValueChange={(v) => alterar({ tipo: v as FiltrosPedidos['tipo'] })}
      >
        <SelectTrigger aria-label="Tipo" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos os tipos</SelectItem>
          <SelectItem value="preco_semana">Valor semanal</SelectItem>
          <SelectItem value="kms">Kms</SelectItem>
          <SelectItem value="franquia">Franquia</SelectItem>
          <SelectItem value="tarifa">Tarifa</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filtros.estado}
        onValueChange={(v) => alterar({ estado: v as FiltrosPedidos['estado'] })}
      >
        <SelectTrigger aria-label="Estado" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos os estados</SelectItem>
          <SelectItem value="aceite">Aceite</SelectItem>
          <SelectItem value="recusado">Recusado</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filtros.ordenacao}
        onValueChange={(v) => alterar({ ordenacao: v as FiltrosPedidos['ordenacao'] })}
      >
        <SelectTrigger aria-label="Ordenar" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="contrato_desc">Contrato ↓</SelectItem>
          <SelectItem value="contrato_asc">Contrato ↑</SelectItem>
          <SelectItem value="data_desc">Data ↓</SelectItem>
          <SelectItem value="data_asc">Data ↑</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
