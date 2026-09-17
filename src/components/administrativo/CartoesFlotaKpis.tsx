import { fmtEur } from './cartoesFlotaTab.types';

const KpiTile = ({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  hint?: string;
}) => (
  <div className="rounded-lg border bg-card/50 px-3 py-2">
    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
      {label}
    </p>
    <p className={`text-lg font-bold ${accent || ''}`}>{value}</p>
    {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
  </div>
);

interface CartoesFlotaKpisProps {
  kpis: {
    total: number;
    emUso: number;
    disp: number;
    canc: number;
    plafondAtivo: number;
    consumoPeriodo: number;
  };
  periodoLabel: string;
}

export function CartoesFlotaKpis({ kpis, periodoLabel }: CartoesFlotaKpisProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiTile label="Total" value={kpis.total} />
      <KpiTile label="Em Uso" value={kpis.emUso} accent="text-blue-600 dark:text-blue-400" />
      <KpiTile label="Disponíveis" value={kpis.disp} accent="text-slate-600 dark:text-slate-300" />
      <KpiTile label="Cancelados" value={kpis.canc} accent="text-red-600 dark:text-red-400" />
      <KpiTile label="Plafond ativo" value={fmtEur(kpis.plafondAtivo)} />
      <KpiTile
        label="Consumo"
        value={fmtEur(kpis.consumoPeriodo)}
        accent="text-orange-500"
        hint={periodoLabel}
      />
    </div>
  );
}
