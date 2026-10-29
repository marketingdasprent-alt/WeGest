import { useState } from 'react';
import { FileSpreadsheet, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/utils/formatters';
import {
  PERIODO_LABEL,
  datasDoPeriodo,
  periodoDasDatas,
  type Periodo,
} from '@/utils/periodoPorLiquidar';

interface CabecalhoPorLiquidarProps {
  de: string;
  ate: string;
  onPeriodoChange: (de: string, ate: string) => void;
  pesquisa: string;
  onPesquisaChange: (v: string) => void;
  onExportar: () => void;
  /** null enquanto carrega. */
  resumo: { total: number; clientes: number; faturas: number } | null;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export const CabecalhoPorLiquidar: React.FC<CabecalhoPorLiquidarProps> = ({
  de,
  ate,
  onPeriodoChange,
  pesquisa,
  onPesquisaChange,
  onExportar,
  resumo,
}) => {
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
    <div className="space-y-4">
      {/* O Excel exporta o que o resumo descreve: fica ao lado dele, não perdido no fim dos filtros. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-4xl font-bold tracking-tight tabular-nums">
              {resumo ? formatCurrency(resumo.total) : '—'}
            </span>
            <span className="text-base text-muted-foreground">
              por liquidar
              {resumo &&
                ` · ${plural(resumo.clientes, 'cliente', 'clientes')} · ${plural(resumo.faturas, 'fatura', 'faturas')}`}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Escolha as faturas que o cliente pagou e carregue em Registar pagamento.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-9 gap-2"
          disabled={!resumo || resumo.faturas === 0}
          onClick={onExportar}
        >
          <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={periodo} onValueChange={handlePeriodo}>
          <SelectTrigger className="h-9 w-44" aria-label="Período">
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
        {periodo === 'personalizado' && (
          <>
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
          </>
        )}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar cliente"
            value={pesquisa}
            onChange={(e) => onPesquisaChange(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
      </div>
    </div>
  );
};
