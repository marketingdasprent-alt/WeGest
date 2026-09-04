import { LayoutDashboard, Wrench } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useAssistenciaInicioResumo } from '@/hooks/useAssistenciaInicioResumo';

export function DashboardAssistencia() {
  const { user } = useAuth();
  const { kpis, categorias, loading } = useAssistenciaInicioResumo(user?.id);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <StickyPageHeader title="Início" />

      <div className="flex items-center gap-2">
        <LayoutDashboard className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Início</h1>
        <span className="ml-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          Assistência
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Por resolver" value={loading ? '—' : kpis.porResolver} icon={Wrench} color="amber" />
        <KpiCard label="Não atribuídos" value={loading ? '—' : kpis.naoAtribuidos} icon={Wrench} color="red" />
        <KpiCard label="Atribuídos a mim" value={loading ? '—' : kpis.atribuidosAMim} icon={Wrench} color="blue" />
        <KpiCard label="Resolvidos hoje" value={loading ? '—' : kpis.resolvidosHoje} icon={Wrench} color="green" />
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">Principais categorias</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {loading ? (
            <p className="text-sm text-muted-foreground col-span-full">A carregar…</p>
          ) : categorias.length === 0 ? (
            <p className="text-sm text-muted-foreground col-span-full">Sem categorias configuradas.</p>
          ) : (
            categorias.map((c) => (
              <div key={c.id} className="rounded-lg border bg-card p-3 shadow-sm space-y-1">
                <Wrench className="h-5 w-5" style={{ color: c.cor }} />
                <div className="text-lg font-bold truncate" title={c.nome}>
                  {c.contagem} ticket{c.contagem !== 1 && 's'}
                </div>
                <div className="text-xs text-muted-foreground truncate" title={c.nome}>
                  {c.nome}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
