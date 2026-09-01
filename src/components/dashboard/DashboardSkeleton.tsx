import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton do dashboard — mantém a forma do layout real (faixa de KPIs +
 * gráfico e donut à esquerda, "Precisa de atenção" à direita, histórico e mapa
 * por baixo) em vez de bloquear o ecrã com um spinner central sem contexto.
 * Tem de acompanhar o layout de Dashboard.tsx: um skeleton com outra forma
 * faz a página saltar no momento em que os dados chegam.
 */
export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] items-start gap-4">
      <div className="space-y-4">
        <div className="grid grid-cols-2 border-b border-border sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 px-3 py-3 xl:px-4">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_15rem]">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-52" />
              </div>
              <Skeleton className="h-6 w-24" />
            </div>
            <Skeleton className="mt-3 h-[190px] w-full" />
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mx-auto mt-3 h-[168px] w-[168px] rounded-full" />
            <div className="mt-3 space-y-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-4 w-36" />
        <div className="mt-3 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card">
          <div className="px-4 py-3">
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-[288px] w-full rounded-none" />
        </div>
      ))}
    </div>
  </div>
);
