import { useState } from 'react';
import { KeyRound, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/section-card';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { useEnviarAcessoMotorista, useEstadoAcessoMotorista } from '@/hooks/useAcessoMotorista';
import { AcessoAppDialogs } from './AcessoAppDialogs';
import { estadoAcesso, type TomAcesso } from './estadoAcesso';

interface AcessoAppSectionProps {
  motoristaId: string;
}

const COR_TOM: Record<TomAcesso, string> = {
  neutro: 'text-muted-foreground',
  ok: 'text-green-600 dark:text-green-400',
  aviso: 'text-amber-600 dark:text-amber-400',
  erro: 'text-destructive',
};

export function AcessoAppSection({ motoristaId }: AcessoAppSectionProps) {
  const { hasPermission } = usePermissions();
  const { data, isLoading, error } = useEstadoAcessoMotorista(motoristaId);
  const enviar = useEnviarAcessoMotorista();
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  const [substituicao, setSubstituicao] = useState(false);

  const vista = data ? estadoAcesso(data) : null;
  const podeGerir = hasPermission('motoristas_acesso_app');

  const enviarAcesso = (confirmarSubstituicao: boolean) => {
    enviar.mutate(
      { motoristaId, confirmarSubstituicao },
      {
        onSuccess: (r) => setSubstituicao(r.status === 'requer_confirmacao'),
      }
    );
  };

  return (
    <SectionCard
      icon={<KeyRound className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
      title="Acesso à app"
      headerClassName="bg-indigo-50 dark:bg-indigo-950/30 border-b"
    >
      {isLoading ? (
        <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-label="A carregar" />
      ) : error ? (
        <p className="text-sm text-destructive">Erro ao carregar o acesso: {error.message}</p>
      ) : !vista ? (
        <p className="text-sm text-muted-foreground">
          Sem informação de acesso para este motorista.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className={cn('text-sm font-medium', COR_TOM[vista.tom])}>{vista.rotulo}</p>
            {vista.detalhe && <p className="text-xs text-muted-foreground">{vista.detalhe}</p>}
            {vista.aviso && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{vista.aviso}</p>
            )}
          </div>
          {podeGerir && vista.podeEnviar && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={enviar.isPending}
              onClick={() => setConfirmarEnvio(true)}
            >
              {enviar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar acesso
            </Button>
          )}
        </div>
      )}
      <AcessoAppDialogs
        emailDestino={vista?.detalhe ?? null}
        confirmarEnvioAberto={confirmarEnvio}
        substituicaoAberta={substituicao}
        onConfirmarEnvio={() => {
          setConfirmarEnvio(false);
          enviarAcesso(false);
        }}
        onConfirmarSubstituicao={() => {
          setSubstituicao(false);
          enviarAcesso(true);
        }}
        onFecharEnvio={() => setConfirmarEnvio(false)}
        onFecharSubstituicao={() => setSubstituicao(false)}
      />
    </SectionCard>
  );
}
