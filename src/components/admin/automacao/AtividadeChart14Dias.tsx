import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { AtividadeDiaria } from '@/hooks/useAutomationQueue';

const COLORS = { eventos: '#3b82f6', executadas: '#22c55e', falhas: '#ef4444' };

export default function AtividadeChart14Dias({ data }: { data: AtividadeDiaria[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="dia" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="eventos" fill={COLORS.eventos} radius={[4, 4, 0, 0]} name="Eventos" opacity={0.85} />
        <Line type="monotone" dataKey="executadas" stroke={COLORS.executadas} strokeWidth={2} dot={{ r: 3 }} name="Executadas" />
        <Line type="monotone" dataKey="falhas" stroke={COLORS.falhas} strokeWidth={2} dot={{ r: 3 }} name="Falhas" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
