import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ArrowRight, Gauge, History, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useContratoVersoes } from '@/hooks/useContratosRenting';

interface ContratoTabHistoricoProps {
  contratoId: string | null;
  /** Navega para a versão clicada. */
  onAbrirVersao: (versaoId: string) => void;
}

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'dd/MM/yyyy HH:mm', { locale: pt });
};

export const ContratoTabHistorico: React.FC<ContratoTabHistoricoProps> = ({
  contratoId,
  onAbrirVersao,
}) => {
  const { data: versoes = [], isLoading } = useContratoVersoes(contratoId);

  return (
    <div>
      <div className="flex items-center gap-2 pb-2 border-b mb-4">
        <History className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold">Histórico de versões</h3>
        {versoes.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 font-semibold">
            {versoes.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : versoes.length <= 1 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Este é a primeira versão do contrato — ainda não há histórico de alterações.
        </p>
      ) : (
        <ul className="space-y-2">
          {versoes.map((v) => {
            const isActual = v.substituido_em === null;
            const isCurrent = v.id === contratoId;
            const isRenovacao = (v.motivo_versao ?? '').startsWith('Renovação');
            return (
              <li
                key={v.id}
                className={`border rounded-md p-3 ${
                  isActual || isCurrent
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-muted/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">Versão {v.versao}</span>
                      {isActual ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                          actual
                        </span>
                      ) : isRenovacao ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30 font-medium">
                          Fechado · renovado em {fmtData(v.substituido_em)}
                        </span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          substituída em {fmtData(v.substituido_em)}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-medium">
                          visualização atual
                        </span>
                      )}
                    </div>
                    {v.motivo_versao && (
                      <p className="text-sm text-muted-foreground mt-1">{v.motivo_versao}</p>
                    )}
                    {(v.km_saida != null || v.km_entrada != null) && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Gauge className="h-3 w-3 shrink-0" />
                        Km {v.km_saida != null ? v.km_saida.toLocaleString('pt-PT') : '—'} →{' '}
                        {v.km_entrada != null ? v.km_entrada.toLocaleString('pt-PT') : '—'}
                        {v.km_saida != null && v.km_entrada != null && (
                          <span className="font-medium">
                            {' '}
                            ({(v.km_entrada - v.km_saida).toLocaleString('pt-PT')} km)
                          </span>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Criada {fmtData(v.created_at)} · #{v.codigo}
                    </p>
                  </div>
                  {!isCurrent && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onAbrirVersao(v.id)}
                      className="gap-1 shrink-0"
                    >
                      Abrir
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
