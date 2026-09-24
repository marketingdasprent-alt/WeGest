import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Loader2, RefreshCw } from 'lucide-react';

import type { RenovacaoRegisto } from '@/hooks/useContratoRenovacoes';

interface ContratoRenovacoesListaProps {
  renovacoes: RenovacaoRegisto[];
  isLoading: boolean;
  error: Error | null;
}

const fmtDataHora = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yyyy HH:mm', { locale: pt });
};

/** Renovações TVDE de 08-09 a 24-09, que não guardaram o período numa versão. */
export const ContratoRenovacoesLista: React.FC<ContratoRenovacoesListaProps> = ({
  renovacoes,
  isLoading,
  error,
}) => (
  <div className="mb-6">
    <div className="flex items-center gap-2 pb-2 border-b mb-4">
      <RefreshCw className="h-5 w-5 text-primary" />
      <h3 className="text-base font-semibold">Renovações sem versão</h3>
      {renovacoes.length > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 font-semibold">
          {renovacoes.length}
        </span>
      )}
    </div>
    <p className="text-xs text-muted-foreground -mt-2 mb-3">
      Feitas entre 08/09 e 24/09/2026, quando renovar não guardava o período numa versão. As
      renovações seguintes aparecem no histórico de versões.
    </p>

    {isLoading ? (
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ) : error ? (
      <p className="text-sm text-destructive py-4">
        Erro ao carregar as renovações: {error.message}
      </p>
    ) : renovacoes.length === 0 ? (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Sem renovações sem versão neste contrato.
      </p>
    ) : (
      <ul className="space-y-2">
        {renovacoes.map((r) => (
          <li
            key={r.id}
            className="border rounded-md p-3 border-border bg-muted/20 flex items-center justify-between gap-3 flex-wrap text-sm"
          >
            <span className="tabular-nums">Renovado em {fmtDataHora(r.criadoEm)}</span>
            <span className="tabular-nums font-medium">próxima renovação {r.proxima}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);
