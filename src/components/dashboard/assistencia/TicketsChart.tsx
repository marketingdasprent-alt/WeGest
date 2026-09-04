// Gráfico de tickets do dashboard de Assistência — isolado num componente
// próprio para ser carregado via lazy(), pela mesma razão dos outros dois:
// recharts não deve entrar no chunk inicial de /dashboard.
//
// Barras de aberturas e linha de resoluções na mesma escala (são ambos
// contagens de tickets): o que interessa ler é se se resolve ao ritmo a que se
// abre, e duas escalas escondiam exactamente isso.
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { PontoTickets } from './serieTickets';

interface TicketsChartProps {
  data: PontoTickets[];
}

// Cores por token, nunca hex solto — acompanham os dois temas.
const COR_ABERTOS = 'hsl(var(--brand-navy))';
const COR_RESOLVIDOS = 'hsl(var(--success))';

export default function TicketsChart({ data }: TicketsChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
        <p className="mb-1 font-semibold text-popover-foreground">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="text-muted-foreground">
            {p.dataKey === 'abertos' ? 'Abertos' : 'Resolvidos'}:{' '}
            <b className="font-semibold text-popover-foreground tabular-nums">{p.value}</b>
          </p>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          width={32}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
        <Bar dataKey="abertos" fill={COR_ABERTOS} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line
          type="monotone"
          dataKey="resolvidos"
          stroke={COR_RESOLVIDOS}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
