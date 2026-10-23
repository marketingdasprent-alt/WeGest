import { useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ChevronDown, ChevronRight, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { descreverPassoDano, useDanoHistorico } from '@/hooks/useDanoHistorico';

interface DanoHistoricoProps {
  danoId: string;
}

export function DanoHistorico({ danoId }: DanoHistoricoProps) {
  const [aberto, setAberto] = useState(false);
  // Só pede ao abrir: a lista de danos de uma viatura pode ter dezenas.
  const { data = [], isLoading, error } = useDanoHistorico(danoId, { enabled: aberto });

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => setAberto((v) => !v)}
      >
        {aberto ? (
          <ChevronDown className="h-3 w-3 mr-1" />
        ) : (
          <ChevronRight className="h-3 w-3 mr-1" />
        )}
        <History className="h-3 w-3 mr-1" />
        Histórico do processo
      </Button>

      {aberto && (
        <div className="mt-2 ml-2 border-l pl-4 space-y-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {error && (
            <p className="text-sm text-destructive">Erro ao carregar histórico: {error.message}</p>
          )}
          {!isLoading && !error && data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sem alterações registadas desde que o histórico começou a ser guardado.
            </p>
          )}
          {data.map((entrada) => (
            <div key={entrada.id} className="text-sm">
              <p className="font-medium">{descreverPassoDano(entrada)}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(entrada.criadoEm), "d MMM yyyy 'às' HH:mm", { locale: pt })}
                {entrada.atorNome && ` · ${entrada.atorNome}`}
              </p>
              {entrada.campo === 'observacoes' && entrada.valorAnterior && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground line-through">
                  {entrada.valorAnterior}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
