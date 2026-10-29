import { CheckCircle2 } from 'lucide-react';
import { ErroReciboAviso } from '@/components/faturacao/ErroReciboAviso';
import { formatCurrency } from '@/utils/formatters';
import type { ResultadoLote } from '@/hooks/useRegistarRecibosLote';
import type { ResultadoRecibo } from '@/lib/recibos';

type Feito = Extract<ResultadoRecibo, { ok: true }>;
type Falhado = Extract<ResultadoRecibo, { ok: false }>;

interface ResultadoRecibosLoteProps {
  resultado: ResultadoLote;
}

const nomeFatura = (ref: string | null, cliente: string) =>
  `${ref ?? 'Fatura sem documento fiscal'} · ${cliente}`;

export const ResultadoRecibosLote: React.FC<ResultadoRecibosLoteProps> = ({ resultado }) => {
  const feitos = resultado.resultados.filter((r): r is Feito => r.ok === true);
  const falhados = resultado.resultados.filter((r): r is Falhado => r.ok === false);

  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium">
        {feitos.length} {feitos.length === 1 ? 'recibo feito' : 'recibos feitos'}
        {falhados.length > 0 && `, ${falhados.length} com erro`}.
      </p>
      {resultado.jaPagas > 0 && (
        <p className="text-xs text-muted-foreground">
          {resultado.jaPagas}{' '}
          {resultado.jaPagas === 1 ? 'fatura já estava paga' : 'faturas já estavam pagas'} quando
          carregou no botão — ficaram de fora.
        </p>
      )}

      {falhados.map((r) => (
        <ErroReciboAviso
          key={r.cobranca.id}
          erro={r.erro}
          contexto={nomeFatura(r.cobranca.documento_externo_ref, r.cobranca.destinatario_nome)}
        />
      ))}

      {feitos.length > 0 && (
        <ul className="divide-y rounded-md border">
          {feitos.map((r) => (
            <li key={r.cobranca.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="flex-1 truncate">
                {nomeFatura(r.cobranca.documento_externo_ref, r.cobranca.destinatario_nome)}
              </span>
              <span className="tabular-nums">{formatCurrency(r.cobranca.saldoPagar)}</span>
              <span className="font-mono text-muted-foreground">
                {r.recibo.numeroFiscal ?? 'só no WeGest'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {feitos.some((r) => r.recibo.aviso) && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {feitos
            .map((r) => r.recibo.aviso)
            .filter(Boolean)
            .join(' ')}
        </p>
      )}
    </div>
  );
};
