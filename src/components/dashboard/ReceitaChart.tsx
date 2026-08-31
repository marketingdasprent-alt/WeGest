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

// Cores por token e não por hex solto: o #3b82f6/#22c55e liam-se bem sobre o
// cartão escuro mas perdiam contraste sobre o cartão branco do tema claro, e
// não acompanhavam a paleta do resto da homepage (KPIs, donut).
const COR_RECEITA = 'hsl(var(--primary))';
const COR_ALUGADOS = 'hsl(var(--brand-navy))';
const COR_DEVOLVIDOS = 'hsl(var(--success))';
const COR_EIXO = 'hsl(var(--muted-foreground))';
const COR_GRELHA = 'hsl(var(--border))';

export default function ReceitaChart({
  data,
  formatCurrency,
  granularidade,
  mostrarReceita,
}: ReceitaChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const point = data.find((p) => p.periodo === label);
    // Nome à esquerda, valor alinhado à direita em tabular-nums: antes eram
    // três linhas de texto colorido de larguras diferentes, impossíveis de
    // comparar de relance entre períodos.
    const linhas = [
      ...(mostrarReceita
        ? [
            {
              cor: COR_RECEITA,
              nome: 'Receita',
              valor: formatCurrency(point?.receitaContratada ?? 0),
            },
          ]
        : []),
      { cor: COR_ALUGADOS, nome: 'Alugados', valor: String(point?.alugados ?? 0) },
      { cor: COR_DEVOLVIDOS, nome: 'Devolvidos', valor: String(point?.devolvidos ?? 0) },
    ];
    return (
      <div className="min-w-[9rem] rounded-lg border border-border bg-popover p-2.5 shadow-md">
        <p className="mb-1.5 text-xs font-semibold text-popover-foreground">
          {point?.label || label}
        </p>
        <div className="space-y-1">
          {linhas.map((l) => (
            <div key={l.nome} className="flex items-center justify-between gap-6 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.cor }} />
                {l.nome}
              </span>
              <span className="font-semibold tabular-nums text-popover-foreground">{l.valor}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 6" vertical={false} stroke={COR_GRELHA} />
        <XAxis
          dataKey="periodo"
          tick={{ fontSize: 11, fill: COR_EIXO }}
          tickLine={false}
          axisLine={false}
          dy={4}
        />
        {mostrarReceita && (
          <YAxis
            yAxisId="euro"
            tick={{ fontSize: 11, fill: COR_EIXO }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v) =>
              v >= 1000 ? `${(v / 1000).toFixed(1).replace('.0', '')}k€` : `${Math.round(v)}€`
            }
          />
        )}
        <YAxis
          yAxisId="count"
          orientation={mostrarReceita ? 'right' : 'left'}
          tick={{ fontSize: 11, fill: COR_EIXO }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={32}
        />
        {/* Sem <Legend>: os mesmos três rótulos já estão no cabeçalho do card,
            e lá vêm com os totais do período — a legenda do recharts era uma
            segunda cópia sem informação nova, a roubar 28px ao gráfico. */}
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: 'hsl(var(--muted-foreground))', fillOpacity: 0.08 }}
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
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
          name="alugados"
        />
        <Line
          yAxisId="count"
          type={granularidade === 'dia' ? 'linear' : 'monotone'}
          dataKey="devolvidos"
          stroke={COR_DEVOLVIDOS}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
          name="devolvidos"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
