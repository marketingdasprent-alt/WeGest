// Gráfico de Atividade & Rentabilidade do Dashboard, isolado num componente
// próprio para ser carregado via lazy() — assim o recharts (~400KB) sai do
// chunk inicial do Dashboard (página de aterragem pós-login).
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = {
  rentabilidade: '#8b5cf6',
  alugadas: '#3b82f6',
  devolvidas: '#22c55e',
};

export interface AtividadePonto {
  periodo: string;
  label?: string;
  rentabilidade: number;
  alugadas: number;
  devolvidas: number;
}

interface AtividadeChartProps {
  data: AtividadePonto[];
  formatCurrency: (value: number) => string;
  /** Quando false (variante Operacional), esconde a série de rentabilidade —
   *  só ficam as linhas de Alugadas/Devolvidas. */
  showRentabilidade?: boolean;
}

export default function AtividadeChart({
  data,
  formatCurrency,
  showRentabilidade = true,
}: AtividadeChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const point = data.find((p) => p.periodo === label);
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm space-y-1">
        <p className="font-medium text-foreground mb-1">{point?.label || label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {p.dataKey === 'rentabilidade' ? formatCurrency(p.value) : p.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
        {showRentabilidade && (
          <YAxis
            yAxisId="euro"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          />
        )}
        <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          formatter={(v) =>
            v === 'rentabilidade' ? 'Renda (€)' : v === 'alugadas' ? 'Alugadas' : 'Devolvidas'
          }
        />
        {showRentabilidade && (
          <Bar
            yAxisId="euro"
            dataKey="rentabilidade"
            fill={COLORS.rentabilidade}
            radius={[4, 4, 0, 0]}
            name="rentabilidade"
            opacity={0.85}
          />
        )}
        <Line
          yAxisId="count"
          type="monotone"
          dataKey="alugadas"
          stroke={COLORS.alugadas}
          strokeWidth={2}
          dot={{ r: 3 }}
          name="alugadas"
        />
        <Line
          yAxisId="count"
          type="monotone"
          dataKey="devolvidas"
          stroke={COLORS.devolvidas}
          strokeWidth={2}
          dot={{ r: 3 }}
          name="devolvidas"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
