import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingDown, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/components/dashboard/frota/atividade';
import { useMotoristasSemana } from '@/hooks/useMotoristasSemana';
import {
  formatarIntervaloSemana,
  type GestorContagem,
  type MotoristaNegativo,
} from './motoristasSemana';

/** Quantos negativos cabem sem a lista empurrar o bloco dos gestores para fora. */
const PREVIEW_NEGATIVOS = 5;

function NegativoRow({ motorista, onClick }: { motorista: MotoristaNegativo; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-4 py-1.5 text-left transition-colors hover:bg-muted/50"
    >
      <span className="truncate text-[13px] font-medium leading-tight">{motorista.nome}</span>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-destructive">
        {formatCurrency(motorista.liquido)}
      </span>
    </button>
  );
}

function GestorRow({ gestor, maximo }: { gestor: GestorContagem; maximo: number }) {
  const percentagem = maximo > 0 ? Math.round((gestor.total / maximo) * 100) : 0;
  return (
    <div className="flex items-center gap-3 px-4 py-1">
      <span
        className={cn(
          'w-32 shrink-0 truncate text-[13px] leading-tight',
          gestor.chave ? 'font-medium' : 'italic text-muted-foreground'
        )}
      >
        {gestor.nome}
      </span>
      {/* A barra é só escala relativa ao maior gestor — o número é que conta,
          por isso fica fora dela e não dentro. */}
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary/70"
          style={{ width: `${percentagem}%` }}
        />
      </span>
      <span className="w-7 shrink-0 text-right text-[13px] font-semibold tabular-nums">
        {gestor.total}
      </span>
    </div>
  );
}

export const MotoristasSemanaCard: React.FC<{ enabled?: boolean }> = ({ enabled = true }) => {
  const navigate = useNavigate();
  const { data, isLoading } = useMotoristasSemana(enabled);

  const semana = data?.semana ?? null;
  const negativos = data?.negativos ?? [];
  const porGestor = data?.porGestor ?? [];
  const maximoGestor = porGestor[0]?.total ?? 0;

  return (
    <Card className="flex flex-col rounded-xl shadow-none">
      <CardHeader className="px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <TrendingDown className="h-4 w-4 text-destructive" />
          Motoristas negativos
          {semana && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {formatarIntervaloSemana(semana.inicio, semana.fim)}
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 p-0 pb-3">
        {isLoading ? (
          <div className="space-y-2 px-4">
            <Skeleton className="h-8 w-32" />
            {Array.from({ length: PREVIEW_NEGATIVOS }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : !semana ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Ainda não há nenhuma semana fechada com líquidos gravados.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2 px-4">
              <span className="text-2xl font-semibold tabular-nums text-destructive">
                {negativos.length}
              </span>
              <span className="text-xs text-muted-foreground">
                de {data?.totalComLiquido ?? 0} com líquido nessa semana
              </span>
            </div>

            {negativos.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">
                Nenhum motorista fechou a semana negativo.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {negativos.slice(0, PREVIEW_NEGATIVOS).map((m) => (
                  <NegativoRow
                    key={m.id}
                    motorista={m}
                    onClick={() => navigate(`/motoristas/${m.id}`)}
                  />
                ))}
              </div>
            )}

            <div className="mt-auto border-t border-border/60 pt-2">
              <p className="flex items-center gap-2 px-4 pb-1 text-xs font-semibold text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                Motoristas por gestor
                <span className="ml-auto font-normal tabular-nums">
                  {data?.totalMotoristas ?? 0}
                </span>
              </p>
              {porGestor.length === 0 ? (
                <p className="px-4 py-2 text-sm text-muted-foreground">
                  Nenhum motorista activo.
                </p>
              ) : (
                porGestor.map((g) => <GestorRow key={g.chave} gestor={g} maximo={maximoGestor} />)
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
