// Gráfico de faturação do dashboard Financeiro — isolado num componente
// próprio para ser carregado via lazy(), pela mesma razão do ReceitaChart da
// frota: recharts não deve entrar no chunk inicial de /dashboard.
//
// Duas escalas, como no gráfico da frota: barras de valor facturado (eixo
// esquerdo, €) e linha de nº de documentos (eixo direito). O valor sozinho
// fica plano em dias sem emissão, e a linha mostra o ritmo de emissão mesmo
// quando os montantes variam muito.
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
import type { PontoFaturacao } from '@/hooks/useFaturacaoMovimentos';

interface FaturacaoChartProps {
  data: PontoFaturacao[];
  formatCurrency: (value: number) => string;
}

// Cores por token, nunca hex solto — acompanham os dois temas.
const COR_VALOR = 'hsl(var(--primary))';
const COR_DOCUMENTOS = 'hsl(var(--brand-navy))';

export default function FaturacaoChart({ data, formatCurrency }: FaturacaoChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
        <p className="mb-1 font-semibold text-popover-foreground">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="text-muted-foreground">
            {p.dataKey === 'valor' ? 'Faturado' : 'Facturas'}:{' '}
            <b className="font-semibold text-popover-foreground tabular-nums">
              {p.dataKey === 'valor' ? formatCurrency(p.value) : p.value}
            </b>
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
          yAxisId="valor"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v: number) => `${Math.round(v / 1000)}k€`}
        />
        <YAxis
          yAxisId="documentos"
          orientation="right"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          width={32}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
        <Bar
          yAxisId="valor"
          dataKey="valor"
          fill={COR_VALOR}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Line
          yAxisId="documentos"
          type="monotone"
          dataKey="contagem"
          stroke={COR_DOCUMENTOS}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
