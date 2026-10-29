import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { numeroCurto } from '@/utils/numeroDocumento';
import type { ClienteComFaturas, FaturaPorLiquidar } from '@/hooks/useFaturasPorLiquidar';

interface FaturasPorLiquidarTabelaProps {
  grupos: ClienteComFaturas[];
  selecionadas: Set<string>;
  onToggleFatura: (id: string) => void;
  onToggleCliente: (grupo: ClienteComFaturas) => void;
  onVerPdf: (fatura: FaturaPorLiquidar) => void;
  /** Fatura cujo PDF está a abrir. */
  pdfAAbrir: string | null;
}

interface LinhaFaturaProps {
  f: FaturaPorLiquidar;
  marcada: boolean;
  aAbrir: boolean;
  onToggle: () => void;
  onVerPdf: () => void;
}

const LinhaFatura: React.FC<LinhaFaturaProps> = ({ f, marcada, aAbrir, onToggle, onVerPdf }) => {
  const abatido = f.pago + f.creditado;
  return (
    <li
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-4 px-4 py-3 sm:grid-cols-[auto_8rem_minmax(0,1fr)_auto_auto]',
        marcada && 'bg-primary/10'
      )}
    >
      <Checkbox
        aria-label={`Escolher ${numeroCurto(f.documento_externo_ref)}`}
        checked={marcada}
        onCheckedChange={onToggle}
      />
      <div className="leading-tight">
        <p className="font-medium tabular-nums">{numeroCurto(f.documento_externo_ref)}</p>
        <p className="text-xs text-muted-foreground">{formatDate(f.emitidaEm)}</p>
      </div>
      <p className="hidden truncate text-sm text-muted-foreground sm:block">{f.descricao ?? ''}</p>
      <div className="text-right leading-tight">
        <p className="font-semibold tabular-nums">{formatCurrency(f.saldoPagar)}</p>
        {abatido > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            de {formatCurrency(f.valorTotal)} · já abatido {formatCurrency(abatido)}
          </p>
        )}
      </div>
      {f.documento_externo_ref ? (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          aria-label={`Ver PDF de ${f.documento_externo_ref}`}
          disabled={aAbrir}
          onClick={onVerPdf}
        >
          {aAbrir ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          PDF
        </Button>
      ) : (
        <span />
      )}
    </li>
  );
};

export const FaturasPorLiquidarTabela: React.FC<FaturasPorLiquidarTabelaProps> = ({
  grupos,
  selecionadas,
  onToggleFatura,
  onToggleCliente,
  onVerPdf,
  pdfAAbrir,
}) => (
  <div className="space-y-4">
    {grupos.map((g) => {
      const marcadas = g.faturas.filter((f) => selecionadas.has(f.id)).length;
      return (
        <section key={g.clienteId} className="overflow-hidden rounded-lg bg-card">
          <header className="flex items-center gap-4 bg-muted/50 px-4 py-3">
            <Checkbox
              aria-label={`Escolher todas as faturas de ${g.clienteNome}`}
              checked={
                marcadas === g.faturas.length ? true : marcadas > 0 ? 'indeterminate' : false
              }
              onCheckedChange={() => onToggleCliente(g)}
            />
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold">{g.clienteNome}</h3>
              <p className="text-xs text-muted-foreground">
                {g.faturas.length} {g.faturas.length === 1 ? 'fatura' : 'faturas'} por liquidar
              </p>
            </div>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(g.totalPendente)}</p>
          </header>
          <ul className="divide-y divide-border/50">
            {g.faturas.map((f) => (
              <LinhaFatura
                key={f.id}
                f={f}
                marcada={selecionadas.has(f.id)}
                aAbrir={pdfAAbrir === f.id}
                onToggle={() => onToggleFatura(f.id)}
                onVerPdf={() => onVerPdf(f)}
              />
            ))}
          </ul>
        </section>
      );
    })}
  </div>
);
