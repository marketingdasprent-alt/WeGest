import { useParams } from 'react-router-dom';
import {
  Trophy,
  Car,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Crown,
  ChevronsUp,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis } from 'recharts';
import { useQuadroLive } from '@/hooks/useQuadroLive';
import type { GestorScore } from '@/utils/quadroLive.types';

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}
function diaCurto(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}
function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '—';
}

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// Cores do pódio (1º ouro, 2º prata, 3º bronze).
const PODIO = [
  {
    ring: 'ring-amber-400',
    bg: 'bg-amber-400/10',
    text: 'text-amber-500 dark:text-amber-400',
    h: 'h-32',
  },
  {
    ring: 'ring-zinc-400',
    bg: 'bg-zinc-400/10',
    text: 'text-zinc-500 dark:text-zinc-300',
    h: 'h-24',
  },
  {
    ring: 'ring-orange-400',
    bg: 'bg-orange-400/10',
    text: 'text-orange-500 dark:text-orange-400',
    h: 'h-20',
  },
];

// ── Pódio (top 3) ────────────────────────────────────────────────────────────

function PodioLugar({ g, pos }: { g: GestorScore; pos: number }) {
  const p = PODIO[pos];
  return (
    <div className="flex flex-1 flex-col items-center justify-end gap-2">
      {pos === 0 && <Crown className="h-8 w-8 text-amber-400" />}
      <div
        className={`grid h-16 w-16 place-items-center rounded-full text-2xl font-bold ring-4 ${p.ring} ${p.bg} text-zinc-900 dark:text-white`}
      >
        {iniciais(g.gestor)}
      </div>
      <div className="text-center">
        <div className="truncate text-lg font-bold text-zinc-900 dark:text-white">{g.gestor}</div>
        <div className={`text-4xl font-extrabold tabular-nums ${p.text}`}>{g.alugados}</div>
        <div className="mt-1 flex items-center justify-center gap-3 text-base font-semibold">
          <span className="flex items-center gap-1 text-sky-500" title="Devolvidos">
            <ArrowDownLeft className="h-4 w-4" />
            {g.devolvidos}
          </span>
          <span className="flex items-center gap-1 text-violet-500" title="Trocas">
            <RefreshCw className="h-4 w-4" />
            {g.trocas}
          </span>
          <span className="flex items-center gap-1 text-fuchsia-500" title="Mudanças de grupo">
            <ChevronsUp className="h-4 w-4" />
            {g.upgrades}
          </span>
        </div>
      </div>
      <div
        className={`flex w-full items-start justify-center rounded-t-xl border border-b-0 border-zinc-200 bg-zinc-100 pt-2 text-2xl font-black text-zinc-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-500 ${p.h}`}
      >
        {pos + 1}º
      </div>
    </div>
  );
}

function Podio({ top }: { top: GestorScore[] }) {
  // Ordem visual: 2º, 1º, 3º (1º ao centro).
  const ordem = [top[1], top[0], top[2]].filter(Boolean);
  const posDe = (g: GestorScore) => top.indexOf(g);
  return (
    <div className="flex items-end gap-3">
      {ordem.map((g) => (
        <PodioLugar key={g.gestor} g={g} pos={posDe(g)} />
      ))}
    </div>
  );
}

// ── KPI ──────────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Car;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          {label}
        </span>
        <Icon className={`h-5 w-5 ${accent}`} />
      </div>
      <div className="text-4xl font-bold tabular-nums text-zinc-900 dark:text-white">{value}</div>
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default function QuadroLive() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = useQuadroLive(token);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-white text-3xl text-zinc-400 dark:bg-zinc-950">
        A carregar…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-white text-3xl text-red-500 dark:bg-zinc-950 dark:text-red-400">
        Quadro indisponível
      </div>
    );
  }

  const top3 = data.leaderboard.slice(0, 3);
  const resto = data.leaderboard.slice(3);
  const maxDia = Math.max(1, ...data.porDia);

  const donutData = [
    { name: 'Disponíveis', value: data.kpis.disponiveis, fill: '#10b981' },
    { name: 'Alugados', value: data.kpis.alugados, fill: '#6366f1' },
  ];
  const totalFrota = data.kpis.disponiveis + data.kpis.alugados;

  const barData = data.porDia.map((v, i) => ({ dia: DIAS[i], alugados: v }));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white p-5 text-zinc-900 dark:bg-zinc-950 dark:text-white">
      {/* Header magro */}
      <header className="mb-3 flex shrink-0 items-center justify-between border-b border-zinc-200 pb-3 dark:border-white/10">
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-amber-400" />
          <h1 className="text-2xl font-bold tracking-tight">
            Ranking da semana{' '}
            <span className="text-zinc-400 dark:text-zinc-500">
              · {diaCurto(data.semana_inicio)}–{diaCurto(data.semana_fim)}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2 text-base text-zinc-400 dark:text-zinc-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          {horaCurta(data.gerado_em)}
        </div>
      </header>

      {/* KPIs */}
      <div className="mb-3 grid shrink-0 grid-cols-5 gap-3">
        <Kpi
          label="Alugados"
          value={data.kpis.alugados}
          icon={ArrowUpRight}
          accent="text-emerald-500"
        />
        <Kpi
          label="Devolvidos"
          value={data.kpis.devolvidos}
          icon={ArrowDownLeft}
          accent="text-sky-500"
        />
        <Kpi label="Trocas" value={data.kpis.trocas} icon={RefreshCw} accent="text-violet-500" />
        <Kpi
          label="Mud. grupo"
          value={data.kpis.upgrades}
          icon={ChevronsUp}
          accent="text-fuchsia-500"
        />
        <Kpi label="Disponíveis" value={data.kpis.disponiveis} icon={Car} accent="text-amber-500" />
      </div>

      {/* Corpo: 2 colunas que preenchem o resto */}
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-4">
        {/* Esquerda (2/3): pódio + resto do ranking + timeline */}
        <div className="col-span-2 flex min-h-0 flex-col gap-4">
          {data.leaderboard.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 text-center dark:border-white/10">
              <Trophy className="h-12 w-12 text-zinc-300 dark:text-zinc-700" />
              <p className="text-xl text-zinc-500">Sem atividade esta semana</p>
            </div>
          ) : (
            <>
              {/* Pódio */}
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <Podio top={top3} />
              </div>

              {/* Resto do ranking (4º+) — compacto, sem scroll */}
              {resto.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {resto.map((g, i) => (
                    <div
                      key={g.gestor}
                      className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.02]"
                    >
                      <span className="text-base font-bold text-zinc-400">{i + 4}º</span>
                      <span className="text-lg font-semibold">{g.gestor}</span>
                      <span className="text-xl font-extrabold tabular-nums text-emerald-500">
                        {g.alugados}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Timeline barras — ritmo da semana */}
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <h3 className="mb-2 text-lg font-bold tracking-tight">Ritmo da semana</h3>
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <XAxis
                    dataKey="dia"
                    tick={{ fill: 'currentColor', fontSize: 16, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Bar dataKey="alugados" radius={[6, 6, 0, 0]} fill="#10b981" maxBarSize={64}>
                    {barData.map((d, i) => (
                      <Cell key={i} fillOpacity={d.alugados === maxDia && maxDia > 0 ? 1 : 0.55} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Direita (1/3): proporção frota (donut) + alugados da semana */}
        <div className="flex min-h-0 flex-col gap-4">
          {/* Donut disponíveis vs alugados */}
          <div className="flex flex-col items-center rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <h3 className="mb-1 self-start text-lg font-bold tracking-tight">Frota</h3>
            <div className="relative h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    innerRadius="65%"
                    outerRadius="90%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    {donutData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-extrabold tabular-nums">
                  {data.kpis.disponiveis}
                </span>
                <span className="text-sm text-zinc-500">de {totalFrota} livres</span>
              </div>
            </div>
            <div className="mt-2 flex w-full justify-around text-base">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: '#10b981' }} />
                Disponíveis
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: '#6366f1' }} />
                Alugados
              </span>
            </div>
          </div>

          {/* Alugados da semana — só os últimos, ícone, sem scroll */}
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <h3 className="mb-2 shrink-0 text-lg font-bold tracking-tight">Últimos alugados</h3>
            {data.alugadosSemana.length === 0 ? (
              <p className="text-base text-zinc-500">Nada esta semana</p>
            ) : (
              <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
                {[...data.alugadosSemana]
                  .reverse()
                  .slice(0, 6)
                  .map((a, i) => (
                    <li
                      key={`${a.matricula}-${a.hora}-${i}`}
                      className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 dark:bg-white/[0.03]"
                    >
                      <Car className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="text-base font-bold">{a.matricula || '—'}</span>
                      <span className="ml-auto truncate text-sm text-zinc-500">{a.gestor}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
