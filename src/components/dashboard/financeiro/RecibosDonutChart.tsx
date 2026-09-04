// Donut dos recibos por estado — companheiro do gráfico de faturação, e
// isolado pelo mesmo motivo (recharts fora do chunk inicial).
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export interface RecibosDonutData {
  validados: number;
  pendentes: number;
  recusados: number;
}

const CORES = {
  validados: 'hsl(var(--success))',
  pendentes: 'hsl(var(--warning))',
  recusados: 'hsl(var(--destructive))',
};

// Mesma regra do donut da frota: uma fatia com 1% do total desenha-se como um
// risco e não como cunha. Só o ÂNGULO é inflacionado — legenda e tooltip
// mostram sempre o valor real.
const MIN_VISUAL_SHARE = 0.06;

export default function RecibosDonutChart({ validados, pendentes, recusados }: RecibosDonutData) {
  const total = validados + pendentes + recusados;
  const minVisual = total * MIN_VISUAL_SHARE;
  const data = [
    {
      name: 'Validados',
      value: validados,
      visual: Math.max(validados, minVisual),
      color: CORES.validados,
    },
    {
      name: 'Pendentes',
      value: pendentes,
      visual: Math.max(pendentes, minVisual),
      color: CORES.pendentes,
    },
    {
      name: 'Recusados',
      value: recusados,
      visual: Math.max(recusados, minVisual),
      color: CORES.recusados,
    },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
        <p className="font-semibold text-popover-foreground">{p.payload.name}</p>
        <p className="text-muted-foreground tabular-nums">{p.payload.value} recibos</p>
      </div>
    );
  };

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie
            data={data}
            dataKey="visual"
            nameKey="name"
            innerRadius={44}
            outerRadius={68}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums">{total}</span>
        <span className="text-[10px] text-muted-foreground">recibos</span>
      </div>
    </div>
  );
}
