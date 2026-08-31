// Donut do estado geral da frota — companheiro do gráfico "Atividade",
// isolado num componente próprio para ser carregado via lazy() (recharts
// não deve entrar no chunk inicial do Dashboard).
//
// Ao contrário do KPI "Ocupação" (que exclui inativas/vendidas do
// denominador para dar uma % de utilização com sentido), este donut mostra
// a frota completa — incluindo inativas — porque aqui o objectivo é
// justamente ver para onde vai o resto da frota, não medir utilização.
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export interface FrotaDonutData {
  disponiveis: number;
  ocupados: number;
  inativos: number;
}

// O azul passa a vir do token da marca (era #60a5fa): é o mesmo azul das
// "Alugadas" na faixa de KPIs e da série "Alugados" no gráfico — um só azul
// para "viatura em uso" em toda a homepage, e com contraste nos dois temas.
const CORES = {
  disponiveis: 'hsl(var(--success))',
  ocupados: 'hsl(var(--brand-navy))',
  inativos: 'hsl(var(--muted-foreground))',
};

// Fatia mínima garantida no desenho: 6% do total. Fatias muito pequenas
// (ex: 4 em 405 viaturas = ~1%) resultavam num ângulo tão fino que, mesmo
// com minAngle, liam-se como um "corte"/risco na coroa em vez de uma cunha
// colorida. Só o ÂNGULO da fatia é inflacionado — a legenda, o tooltip e o
// total ao centro mostram sempre o valor real (`value`), nunca o inflacionado.
const MIN_VISUAL_SHARE = 0.06;

export default function FrotaDonutChart({ disponiveis, ocupados, inativos }: FrotaDonutData) {
  const total = disponiveis + ocupados + inativos;
  const minVisual = total * MIN_VISUAL_SHARE;
  const data = [
    {
      name: 'Disponíveis',
      value: disponiveis,
      visual: Math.max(disponiveis, minVisual),
      color: CORES.disponiveis,
    },
    {
      name: 'Ocupados',
      value: ocupados,
      visual: Math.max(ocupados, minVisual),
      color: CORES.ocupados,
    },
    {
      name: 'Inativos',
      value: inativos,
      visual: Math.max(inativos, minVisual),
      color: CORES.inativos,
    },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0];
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.payload.color }} />
        <span className="font-semibold tabular-nums text-popover-foreground">
          {p.payload.value}
        </span>
        <span className="text-muted-foreground">{p.payload.name.toLowerCase()}</span>
      </div>
    );
  };

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={168}>
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Pie
              data={data}
              // O ÂNGULO vem de `visual` (com piso de 6%), não do valor real
              // — ver MIN_VISUAL_SHARE acima. Sem paddingAngle: com fatias
              // muito desiguais, um espaçamento fixo esmagaria a pequena.
              dataKey="visual"
              nameKey="name"
              innerRadius={52}
              outerRadius={76}
              isAnimationActive
            >
              {data.map((d) => (
                // O stroke é da MESMA cor que o preenchimento (não do fundo)
                // — só serve para tapar a costura sub-pixel que o SVG deixa
                // entre arcos adjacentes; com uma cor diferente do fundo em
                // vez de a esconder, essa costura ficava mais visível ainda.
                <Cell key={d.name} fill={d.color} stroke={d.color} strokeWidth={1} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums leading-none">{total}</span>
          <span className="text-[10px] text-muted-foreground mt-0.5">viaturas</span>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
              {d.name}
            </span>
            <span className="font-semibold tabular-nums">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
