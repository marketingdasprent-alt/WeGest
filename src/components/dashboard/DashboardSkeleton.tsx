import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton do dashboard — mantém a forma do layout real (hero + KPIs finos +
 * gráfico protagonista à esquerda, atenção + timeline + negócio à direita)
 * em vez de bloquear o ecrã inteiro com um spinner central sem contexto.
 */
export const DashboardSkeleton: React.FC = () => (
  <div>
    <div className="py-6 mb-6 space-y-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-80" />
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-7 items-start">
      <div>
        <div className="flex flex-wrap border-b border-border pb-1 mb-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-1 min-w-[135px] px-4 pt-3 pb-4 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-28" />
          </div>
          <Skeleton className="h-[280px] w-full" />
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
        <div className="border-t border-border pt-4 space-y-2">
          <Skeleton className="h-3 w-28" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
        <div className="border-t border-border pt-4 flex gap-7">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20" />
          ))}
        </div>
      </div>
    </div>
  </div>
);
