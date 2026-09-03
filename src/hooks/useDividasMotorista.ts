// src/hooks/useDividasMotorista.ts
//
// A dívida de um motorista não é um registo que alguém cria: é o seu saldo
// pendente quando dá negativo. Por isso a lista "por cobrar" vem de uma vista
// (`dividas_motorista_abertas`) e não de uma tabela — não há nada para inserir,
// nada que fique desactualizado, e o mesmo motorista nunca aparece duas vezes.
//
// A tabela `dividas_motorista` guarda LIQUIDAÇÕES: uma linha por cada vez que
// alguém marcou a dívida como paga. Marcar paga liquida mesmo os movimentos
// (passam a 'pago'), e por isso o motorista sai da lista de abertas — não é a
// linha a desaparecer, é a dívida a deixar de existir.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type EstadoDivida = 'por_cobrar' | 'paga';

export interface Divida {
  /** Chave de linha na tabela do ecrã. Numa dívida em aberto não existe registo
   *  em BD, por isso usa-se o id do motorista; numa paga é o id da liquidação. */
  id: string;
  motorista_id: string;
  motorista_nome: string;
  periodo_inicio: string;
  periodo_fim: string;
  /** O saldo pendente do motorista. Negativo — é o que ele deve. */
  valor_periodo: number;
  valor_danos: number;
  valor_caucao: number;
  /** O mesmo saldo em positivo, que é como se lê uma dívida. */
  valor_total: number;
  estado: EstadoDivida;
  pago_em: string | null;
}

interface LinhaAberta {
  motorista_id: string;
  motorista_nome: string;
  saldo: number;
  valor_danos: number;
  valor_caucao: number;
  periodo_inicio: string;
  periodo_fim: string;
}

interface LinhaPaga {
  id: string;
  motorista_id: string;
  motorista_nome: string;
  periodo_inicio: string;
  periodo_fim: string;
  valor_periodo: number;
  valor_danos: number;
  valor_caucao: number;
  valor_total: number;
  pago_em: string | null;
  created_at: string;
}

const CHAVE_LISTA = 'dividas-motorista';

export function useDividasMotorista(filtros: {
  pesquisa?: string;
  estado?: 'por_cobrar' | 'paga' | 'todas';
}) {
  const estado = filtros.estado ?? 'todas';
  const pesquisa = filtros.pesquisa ?? '';

  return useQuery({
    queryKey: [CHAVE_LISTA, pesquisa, estado],
    queryFn: async (): Promise<Divida[]> => {
      const querAbertas = estado === 'por_cobrar' || estado === 'todas';
      const querPagas = estado === 'paga' || estado === 'todas';

      const [abertasRes, pagasRes] = await Promise.all([
        querAbertas
          ? (() => {
              let q = supabase
                .from('dividas_motorista_abertas')
                .select('*')
                // Mais a dever primeiro: o saldo é negativo, logo ascendente.
                .order('saldo', { ascending: true });
              if (pesquisa) q = q.ilike('motorista_nome', `%${pesquisa}%`);
              return q;
            })()
          : Promise.resolve({ data: [], error: null }),
        querPagas
          ? (() => {
              let q = supabase
                .from('dividas_motorista')
                .select('*')
                .eq('estado', 'paga')
                .order('pago_em', { ascending: false });
              if (pesquisa) q = q.ilike('motorista_nome', `%${pesquisa}%`);
              return q;
            })()
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (abertasRes.error) throw abertasRes.error;
      if (pagasRes.error) throw pagasRes.error;

      const abertas: Divida[] = ((abertasRes.data ?? []) as LinhaAberta[]).map((l) => ({
        id: l.motorista_id,
        motorista_id: l.motorista_id,
        motorista_nome: l.motorista_nome,
        periodo_inicio: l.periodo_inicio,
        periodo_fim: l.periodo_fim,
        valor_periodo: Number(l.saldo),
        valor_danos: Number(l.valor_danos),
        valor_caucao: Number(l.valor_caucao),
        valor_total: Math.abs(Number(l.saldo)),
        estado: 'por_cobrar',
        pago_em: null,
      }));

      const pagas: Divida[] = ((pagasRes.data ?? []) as LinhaPaga[]).map((l) => ({
        id: l.id,
        motorista_id: l.motorista_id,
        motorista_nome: l.motorista_nome,
        periodo_inicio: l.periodo_inicio,
        periodo_fim: l.periodo_fim,
        valor_periodo: Number(l.valor_periodo),
        valor_danos: Number(l.valor_danos),
        valor_caucao: Number(l.valor_caucao),
        valor_total: Number(l.valor_total),
        estado: 'paga',
        pago_em: l.pago_em,
      }));

      // Por cobrar primeiro: são as que ainda pedem alguma coisa a alguém.
      return [...abertas, ...pagas];
    },
  });
}

/** Erros do Supabase são objectos plain (PostgrestError), NÃO instanceof Error.
 *  A gate `error instanceof Error ? ... : 'Erro inesperado'` já engoliu a causa
 *  real noutro hook desta app — num ecrã de dinheiro isso não pode acontecer. */
function mensagemDeErro(error: unknown): string {
  return (error as { message?: string } | null)?.message ?? 'erro desconhecido';
}

/**
 * Liquida a dívida do motorista: os movimentos pendentes passam a 'pago' e o
 * saldo vai a zero. A conta é feita e travada dentro da BD (RPC), não aqui —
 * entre somar e liquidar não pode entrar um movimento que fique de fora.
 */
export function useMarcarDividaPaga() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (motoristaId: string) => {
      const { data, error } = await supabase.rpc('divida_marcar_paga', {
        p_motorista_id: motoristaId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      // Aqui invalidar é o correcto: a dívida mudou mesmo de lista (saiu das
      // abertas, entrou nas pagas) e os movimentos do motorista mudaram de
      // estado. Um remendo em cache mentiria sobre ambos.
      queryClient.invalidateQueries({ queryKey: [CHAVE_LISTA] });
      queryClient.invalidateQueries({ queryKey: ['motorista-financeiro'] });
      toast.success('Dívida marcada como paga. Os movimentos foram liquidados.');
    },
    onError: (error) => {
      toast.error(`Não foi possível marcar como paga: ${mensagemDeErro(error)}`);
    },
  });
}

/** Desfaz uma liquidação: devolve a pendente exactamente os movimentos que
 *  aquela dívida levou, e mais nenhum. O motorista volta às dívidas em aberto. */
export function useMarcarDividaNaoPaga() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dividaId: string) => {
      const { error } = await supabase.rpc('divida_marcar_nao_paga', {
        p_divida_id: dividaId,
      });
      if (error) throw error;
      return dividaId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CHAVE_LISTA] });
      queryClient.invalidateQueries({ queryKey: ['motorista-financeiro'] });
      toast.success('Dívida reaberta. Os movimentos voltaram a pendente.');
    },
    onError: (error) => {
      toast.error(`Não foi possível reabrir a dívida: ${mensagemDeErro(error)}`);
    },
  });
}
