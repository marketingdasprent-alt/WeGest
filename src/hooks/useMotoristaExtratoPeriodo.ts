import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** A autorização é validada pela RPC; o ID no pedido identifica apenas o alvo. */
export interface ExtratoMotorista {
  periodoInicio: string;
  periodoFim: string;
  receitaBolt: number;
  receitaUber: number;
  gorjetas: number;
  extras: number;
  receita: number;
  viagensBolt: number;
  combustivel: number;
  portagens: number;
  aluguer: number;
  reparacoes: number;
  outros: number;
  totalCustos: number;
  liquido: number;
  /** Distingue período não importado de receita zero. */
  temDadosReceita: boolean;
  /** Distingue custos não lançados de custos nulos. */
  temCustosLancados: boolean;
  acertoLiquido: number | null;
  temAcerto: boolean;
  mediaPorDia: number;
  diasDecorridos: number;
}

export function inicioDaSemana(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function fimDaSemana(d = new Date()): Date {
  const x = inicioDaSemana(d);
  x.setDate(x.getDate() + 6);
  return x;
}

/** Evita que `toISOString` devolva o dia anterior a leste de Greenwich. */
export function paraDataSql(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** A RPC devolve `numeric` como string; valores inválidos não podem chegar à UI como `NaN`. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useMotoristaExtratoPeriodo(
  motoristaId: string | null | undefined,
  inicio: Date,
  fim: Date
) {
  const ini = paraDataSql(inicio);
  const f = paraDataSql(fim);

  return useQuery({
    queryKey: ['motorista-extrato', motoristaId, ini, f],
    enabled: !!motoristaId,
    staleTime: 60_000,
    queryFn: async (): Promise<ExtratoMotorista | null> => {
      const { data, error } = await (supabase as any).rpc('motorista_extrato_periodo', {
        p_motorista_id: motoristaId,
        p_inicio: ini,
        p_fim: f,
      });
      if (error) throw error;

      const r = Array.isArray(data) ? data[0] : data;
      if (!r) return null;

      const receita = num(r.receita);
      // A média usa apenas os dias já decorridos no período.
      const agora = new Date();
      const fimEfetivo = agora < fim ? agora : fim;
      const decorridos = Math.max(
        1,
        Math.floor((fimEfetivo.getTime() - inicio.getTime()) / 86_400_000) + 1
      );

      return {
        periodoInicio: r.periodo_inicio,
        periodoFim: r.periodo_fim,
        receitaBolt: num(r.receita_bolt),
        receitaUber: num(r.receita_uber),
        gorjetas: num(r.gorjetas),
        extras: num(r.extras),
        receita,
        viagensBolt: num(r.viagens_bolt),
        combustivel: num(r.combustivel),
        portagens: num(r.portagens),
        aluguer: num(r.aluguer),
        reparacoes: num(r.reparacoes),
        outros: num(r.outros),
        totalCustos: num(r.total_custos),
        liquido: num(r.liquido),
        temDadosReceita: !!r.tem_dados_receita,
        temCustosLancados: !!r.tem_custos_lancados,
        acertoLiquido: r.acerto_liquido == null ? null : num(r.acerto_liquido),
        temAcerto: !!r.tem_acerto,
        mediaPorDia: receita / decorridos,
        diasDecorridos: decorridos,
      };
    },
  });
}
