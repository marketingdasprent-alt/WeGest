import { lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Euro, Car, Percent } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { DASHBOARD_KPIS, DASHBOARD_ATIVIDADE } from '../tourData';
import { staggerContainer, staggerItem } from '../motionVariants';
import { useCountUp } from '@/hooks/useCountUp';
import { ModuleHeader } from '../ModuleHeader';

const AtividadeChart = lazy(() => import('@/components/dashboard/AtividadeChart'));

const KPI_ICONS = [TrendingUp, Euro, Car, Percent];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);

const KPI_FORMATTERS: Record<(typeof DASHBOARD_KPIS)[number]['unit'], (n: number) => string> = {
  number: (n) => String(Math.round(n)),
  currency: formatCurrency,
  percent: (n) => `${Math.round(n)}%`,
};

const AnimatedKpi = ({
  kpi,
  icon,
}: {
  kpi: (typeof DASHBOARD_KPIS)[number];
  icon: (typeof KPI_ICONS)[number];
}) => {
  const ref = useCountUp(kpi.value, KPI_FORMATTERS[kpi.unit]);

  return (
    <motion.div variants={staggerItem}>
      <KpiCard label={kpi.label} icon={icon} color={kpi.color} value={<span ref={ref}>0</span>} />
    </motion.div>
  );
};

export const AnimatedDashboard = () => {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <ModuleHeader title="Dashboard" subtitle="Visão geral da operação — dados de demonstração." />

      <div className="flex-1 space-y-6 px-8 py-6">
        <motion.div
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          {DASHBOARD_KPIS.map((kpi, index) => (
            <AnimatedKpi key={kpi.label} kpi={kpi} icon={KPI_ICONS[index]} />
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="rounded-lg border border-border bg-card p-4"
        >
          <h2 className="mb-2 text-sm font-medium text-foreground">
            Atividade &amp; rentabilidade
          </h2>
          <Suspense fallback={<div className="h-[220px]" />}>
            <AtividadeChart data={DASHBOARD_ATIVIDADE} formatCurrency={formatCurrency} />
          </Suspense>
        </motion.div>
      </div>
    </div>
  );
};
