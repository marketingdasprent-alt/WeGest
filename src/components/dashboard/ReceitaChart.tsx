// Gráfico de atividade da homepage — isolado num componente próprio para ser
// carregado via lazy() (recharts ~400KB não deve entrar no chunk inicial do
// Dashboard, a página de aterragem pós-login).
//
// Combina duas escalas: barras de receita contratada (eixo esquerdo, €) e
// linhas de alugados/devolvidos (eixo direito, contagem) — a receita sozinha
// (recibos, esparsos) fica plana com demasiada frequência em orgs reais, por
// isso nunca é a única série.
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

export interface ChartPoint {
  periodo: string;
  label: string;
  receitaContratada: number;
  alugados: number;
  devolvidos: number;
}

interface ReceitaChartProps {
  data: ChartPoint[];
  formatCurrency: (value: number) => string;
  /** "dia" usa uma linha mais quebrada (dados granulares); "semana"/"mes" usam
   *  uma curva suave (tendência agregada) — a diferença de traço é deliberada,
   *  não só a escala. */
  granularidade: 'dia' | 'semana' | 'mes';
  /** Operacional nunca vê dinheiro — quando false, esconde as barras de
   *  receita contratada e o eixo €, só ficam as linhas de volume. */
  mostrarReceita: boolean;
}

const COR_RECEITA = 'hsl(var(--primary))';
const COR_ALUGADOS = '#3b82f6';
const COR_DEVOLVIDOS = '#22c55e';

const LEGEND_LABEL: Record<string, string> = {
  receitaContratada: 'Receita Contratada',
  alugados: 'Alugados',
  devolvidos: 'Devolvidos',
};

export default function ReceitaChart({
  data,
  formatCurrency,
  granularidade,
  mostrarReceita,
}: ReceitaChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const point = data.find((p) => p.periodo === label);
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm space-y-1">
        <p className="font-medium text-foreground mb-1">{point?.label || label}</p>
        {mostrarReceita && (
          <p style={{ color: COR_RECEITA }}>{formatCurrency(point?.receitaContratada ?? 0)}</p>
        )}
        <p style={{ color: COR_ALUGADOS }}>{point?.alugados ?? 0} alugados</p>
        <p style={{ color: COR_DEVOLVIDOS }}>{point?.devolvidos ?? 0} devolvidos</p>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis dataKey="periodo" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        {mostrarReceita && (
          <YAxis
            yAxisId="euro"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) =>
              v >= 1000 ? `${(v / 1000).toFixed(1).replace('.0', '')}k€` : `${Math.round(v)}€`
            }
          />
        )}
        <YAxis
          yAxisId="count"
          orientation={mostrarReceita ? 'right' : 'left'}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="top"
          height={28}
          wrapperStyle={{ fontSize: 12 }}
          formatter={(v) => LEGEND_LABEL[v] ?? v}
        />
        {mostrarReceita && (
          <Bar
            yAxisId="euro"
            dataKey="receitaContratada"
            fill={COR_RECEITA}
            fillOpacity={0.75}
            radius={[3, 3, 0, 0]}
            name="receitaContratada"
          />
        )}
        <Line
          yAxisId="count"
          type={granularidade === 'dia' ? 'linear' : 'monotone'}
          dataKey="alugados"
          stroke={COR_ALUGADOS}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
          name="alugados"
        />
        <Line
          yAxisId="count"
          type={granularidade === 'dia' ? 'linear' : 'monotone'}
          dataKey="devolvidos"
          stroke={COR_DEVOLVIDOS}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
          name="devolvidos"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
