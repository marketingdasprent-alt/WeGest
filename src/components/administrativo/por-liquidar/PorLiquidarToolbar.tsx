import { useState } from 'react';
import { CalendarIcon, Search, X } from 'lucide-react';
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
  PERIODO_LABEL,
  datasDoPeriodo,
  periodoDasDatas,
  type Periodo,
} from '@/utils/periodoPorLiquidar';

interface PorLiquidarToolbarProps {
  de: string;
  ate: string;
  onPeriodoChange: (de: string, ate: string) => void;
  pesquisa: string;
  onPesquisaChange: (v: string) => void;
  totalCount: number;
}

/** Filtros no formato de FaturacaoToolbarSection: ícone + seletor, contador à direita. */
export function PorLiquidarToolbar({
  de,
  ate,
  onPeriodoChange,
  pesquisa,
  onPesquisaChange,
  totalCount,
}: PorLiquidarToolbarProps) {
  // "Personalizado" com datas iguais a um atalho voltaria ao atalho; guarda-se a escolha.
  const [personalizado, setPersonalizado] = useState(false);
  const periodo: Periodo = personalizado ? 'personalizado' : periodoDasDatas(de, ate);

  const handlePeriodo = (v: string) => {
    if (v === 'personalizado') return setPersonalizado(true);
    setPersonalizado(false);
    const d = datasDoPeriodo(v as Exclude<Periodo, 'personalizado'>);
    onPeriodoChange(d.de, d.ate);
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Select value={periodo} onValueChange={handlePeriodo}>
          <SelectTrigger className="h-9 min-w-[160px]" aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIODO_LABEL) as Periodo[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PERIODO_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {periodo === 'personalizado' && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="De"
            value={de}
            onChange={(e) => onPeriodoChange(e.target.value, ate)}
            className="h-9 w-40"
          />
          <span className="text-sm text-muted-foreground">até</span>
          <Input
            type="date"
            aria-label="Até"
            value={ate}
            onChange={(e) => onPeriodoChange(de, e.target.value)}
            className="h-9 w-40"
          />
        </div>
      )}

      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar cliente..."
          value={pesquisa}
          onChange={(e) => onPesquisaChange(e.target.value)}
          className="h-9 pl-8"
        />
      </div>

      {pesquisa && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1"
          onClick={() => onPesquisaChange('')}
        >
          <X className="h-4 w-4" /> Limpar Filtros
        </Button>
      )}

      <div className="ml-auto">
        <span className="text-sm text-muted-foreground">
          {totalCount} {totalCount === 1 ? 'fatura' : 'faturas'}
        </span>
      </div>
    </div>
  );
}
