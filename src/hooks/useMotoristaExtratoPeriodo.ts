import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Extrato do motorista num período, para o painel dele.
 *
 * Chama `motorista_extrato_periodo`, que calcula no servidor e verifica lá
 * dentro que quem pede é mesmo aquele motorista — o id que vai no pedido é o
 * alvo, nunca a autorização.
 *
 * Recebe início e fim (não "a semana") porque a função também os recebe:
 * acrescentar semana anterior, mês ou período personalizado passa a ser
 * trabalho de interface, sem tocar no servidor.
 *
 * Não confundir com `useMotoristaResumoSemanal`, que lê a tabela do fecho de
 * semana — essa é a base dos acertos enviados ao motorista. As duas contas
 * podem divergir, e o cartão mostra ambas quando isso acontece.
 */
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
  /** Falso = período ainda não importado. Não é o mesmo que ter ganho zero. */
  temDadosReceita: boolean;
  /** Falso = não há custos lançados. Não é o mesmo que não ter custos. */
  temCustosLancados: boolean;
  /** Líquido segundo o fecho de semana, quando existe para este período. */
  acertoLiquido: number | null;
  temAcerto: boolean;
  mediaPorDia: number;
  diasDecorridos: number;
}

/** Segunda-feira da semana de `d`, em hora local. */
export function inicioDaSemana(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Domingo da semana de `d`. */
export function fimDaSemana(d = new Date()): Date {
  const x = inicioDaSemana(d);
  x.setDate(x.getDate() + 6);
  return x;
}

/** `YYYY-MM-DD` em hora local — `toISOString` daria o dia anterior a leste de Greenwich. */
export function paraDataSql(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * A função devolve `numeric`, que o cliente entrega como string. Sem esta
 * conversão defensiva um nulo virava `NaN` e chegava ao motorista escrito no
 * ecrã como "NaN €".
 */
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
      // Dias DECORRIDOS, não os sete da semana: a meio da semana, dividir por
      // sete dá uma média que o motorista não reconhece como sua.
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
