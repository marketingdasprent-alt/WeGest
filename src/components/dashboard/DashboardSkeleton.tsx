import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton do dashboard — mantém a forma do layout real (KPIs + widgets)
 * em vez de bloquear o ecrã inteiro com um spinner central sem contexto.
 */
export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-5 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-3 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2 space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[220px] w-full" />
        </CardContent>
      </Card>
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((__, j) => (
              <Skeleton key={j} className="h-14 w-full" />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-3 space-y-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-3 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);
