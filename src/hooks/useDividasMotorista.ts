// src/hooks/useDividasMotorista.ts
//
// A dívida de um motorista não é um registo que alguém cria: é o líquido da
// SEMANA quando dá negativo. Por isso a lista "por cobrar" sai de
// `motorista_liquido_semanal` — a mesma linha que o resumo grava — e não de
// uma tabela de dívidas: não há nada para inserir, nada que fique
// desactualizado, e o mesmo motorista nunca aparece duas vezes na semana.
//
// POR SEMANA, E NÃO ACUMULADO
//
// Antes vinha da vista `dividas_motorista_abertas`, que soma TODOS os
// movimentos pendentes do motorista. Numa lista onde se escolhe a semana isso
// lia-se mal: com duas semanas gravadas, quem devia 200 € numa e 300 € noutra
// aparecia a dever 500 € em ambas. A vista continua a existir para o saldo
// global, que é o que a ficha do motorista mostra.
//
// A tabela `dividas_motorista` guarda LIQUIDAÇÕES: uma linha por cada vez que
// alguém marcou a dívida como paga. Marcar paga liquida mesmo os movimentos
// (passam a 'pago'), e por isso o motorista sai da lista de abertas — não é a
// linha a desaparecer, é a dívida a deixar de existir. Essa liquidação também
// é por semana: ver divida_marcar_paga(p_motorista_id, p_data_inicio, p_data_fim).
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

/** Uma linha de `motorista_liquido_semanal` com o líquido negativo. */
interface LinhaAberta {
  motorista_id: string;
  motorista_nome: string;
  liquido: number;
  semana_inicio: string;
  semana_fim: string;
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
  /** Semana a mostrar (yyyy-MM-dd). Sem ela não se carrega nada: uma lista
   *  semanal sem semana escolhida não tem o que mostrar. */
  semanaInicio?: string;
  semanaFim?: string;
}) {
  const estado = filtros.estado ?? 'todas';
  const pesquisa = filtros.pesquisa ?? '';
  const { semanaInicio, semanaFim } = filtros;

  return useQuery({
    enabled: !!semanaInicio && !!semanaFim,
    queryKey: [CHAVE_LISTA, pesquisa, estado, semanaInicio, semanaFim],
    queryFn: async (): Promise<Divida[]> => {
      const querAbertas = estado === 'por_cobrar' || estado === 'todas';
      const querPagas = estado === 'paga' || estado === 'todas';

      const [abertasRes, pagasRes] = await Promise.all([
        querAbertas
          ? (() => {
              let q = supabase
                .from('motorista_liquido_semanal')
                .select('motorista_id, motorista_nome, liquido, semana_inicio, semana_fim')
                .eq('semana_inicio', semanaInicio as string)
                // Só o líquido negativo é dívida. Um positivo é dinheiro a
                // receber e vive no saldo, não aqui.
                .lt('liquido', 0)
                // Mais a dever primeiro: o líquido é negativo, logo ascendente.
                .order('liquido', { ascending: true });
              if (pesquisa) q = q.ilike('motorista_nome', `%${pesquisa}%`);
              return q;
            })()
          : Promise.resolve({ data: [], error: null }),
        querPagas
          ? (() => {
              // A liquidação guarda o período dos movimentos que liquidou, que
              // pode ser mais estreito do que a semana (só os dias com
              // movimento). Por isso é sobreposição, não igualdade.
              let q = supabase
                .from('dividas_motorista')
                .select('*')
                .eq('estado', 'paga')
                .lte('periodo_inicio', semanaFim as string)
                .gte('periodo_fim', semanaInicio as string)
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
        periodo_inicio: l.semana_inicio,
        periodo_fim: l.semana_fim,
        valor_periodo: Number(l.liquido),
        // O líquido semanal é um número só: já traz os danos e a caução
        // descontados no cálculo do resumo, e não os devolve separados. Ficam
        // a zero em vez de se inventar uma decomposição — a tabela do ecrã não
        // os mostra, e a liquidação recalcula-os a partir dos movimentos.
        valor_danos: 0,
        valor_caucao: 0,
        valor_total: Math.abs(Number(l.liquido)),
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

      // Abertas e pagas na MESMA ordem alfabética, não em dois blocos. Marcar
      // uma dívida como paga muda-lhe o estado, não o lugar: com as abertas
      // todas primeiro, a linha saltava para o fundo da lista no momento do
      // clique e lia-se como tendo desaparecido.
      return [...abertas, ...pagas].sort((a, b) =>
        a.motorista_nome.localeCompare(b.motorista_nome, 'pt')
      );
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
 * Liquida a dívida do motorista NAQUELA SEMANA: os movimentos pendentes desses
 * dias passam a 'pago'. A conta é feita e travada dentro da BD (RPC), não aqui
 * — entre somar e liquidar não pode entrar um movimento que fique de fora.
 *
 * O período é obrigatório do lado do ecrã. Sem ele a RPC liquidava tudo o que
 * o motorista tem pendente, incluindo semanas que nem estão à vista — numa
 * lista semanal isso seria dar baixa do que não se está a ver.
 */
export function useMarcarDividaPaga() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      motoristaId: string;
      periodoInicio: string;
      periodoFim: string;
    }) => {
      const { data, error } = await supabase.rpc('divida_marcar_paga', {
        p_motorista_id: args.motoristaId,
        p_data_inicio: args.periodoInicio,
        p_data_fim: args.periodoFim,
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

/**
 * A semana mais recente com líquido gravado.
 *
 * A aba de Dívidas abre nesta, e não na semana em curso: o líquido só existe
 * depois de alguém carregar a semana na lista de Contas, por isso a atual está
 * quase sempre vazia e abrir nela dava a impressão de não haver dívidas
 * nenhumas.
 */
export function useUltimaSemanaComLiquido() {
  return useQuery({
    queryKey: [CHAVE_LISTA, 'ultima-semana'],
    queryFn: async (): Promise<{ inicio: string; fim: string } | null> => {
      const { data, error } = await supabase
        .from('motorista_liquido_semanal')
        .select('semana_inicio, semana_fim')
        .order('semana_inicio', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? { inicio: data.semana_inicio, fim: data.semana_fim } : null;
    },
  });
}

export interface DividasAnteriores {
  /** Quantos motoristas continuam por cobrar em semanas anteriores à escolhida. */
  motoristas: number;
  /** Em quantas semanas distintas isso acontece. */
  semanas: number;
  /** A soma do que falta cobrar, em positivo. */
  total: number;
  /** A semana mais antiga com dívida por cobrar, para se poder saltar lá. */
  maisAntiga: { inicio: string; fim: string } | null;
}

/**
 * O que ficou para trás: dívidas de semanas ANTERIORES à que está no ecrã e
 * que ainda não foram liquidadas.
 *
 * Numa lista onde cada semana é a sua conta, uma dívida antiga sai de vista
 * assim que se avança — e ninguém volta atrás semana a semana para ver o que
 * ficou pendurado. Este contador é o que permite ir acompanhando: fica no topo
 * da aba e só aparece quando há mesmo algo por cobrar.
 *
 * QUEM CONTA COMO PAGO. `divida_marcar_paga` liquida os movimentos e grava a
 * liquidação em `dividas_motorista`, mas NÃO toca no líquido já gravado em
 * `motorista_liquido_semanal` — esse é a fotografia da semana e continua
 * negativo para sempre. Por isso "por cobrar" não pode ser só `liquido < 0`:
 * tem de excluir quem já tem liquidação a cobrir aquela semana. Só contam as
 * liquidações em estado 'paga' — uma 'cancelada' é uma cobrança desfeita, e
 * a dívida volta a estar em aberto.
 */
export function useDividasAnterioresPorCobrar(semanaInicio: string | undefined) {
  return useQuery({
    queryKey: [CHAVE_LISTA, 'anteriores', semanaInicio],
    enabled: !!semanaInicio,
    queryFn: async (): Promise<DividasAnteriores> => {
      const vazio: DividasAnteriores = {
        motoristas: 0,
        semanas: 0,
        total: 0,
        maisAntiga: null,
      };

      const [negativasRes, pagasRes] = await Promise.all([
        supabase
          .from('motorista_liquido_semanal')
          .select('motorista_id, liquido, semana_inicio, semana_fim')
          .lt('semana_inicio', semanaInicio as string)
          .lt('liquido', 0)
          .order('semana_inicio', { ascending: true }),
        supabase
          .from('dividas_motorista')
          .select('motorista_id, periodo_inicio, periodo_fim')
          .eq('estado', 'paga')
          .lt('periodo_inicio', semanaInicio as string),
      ]);

      if (negativasRes.error) throw negativasRes.error;
      if (pagasRes.error) throw pagasRes.error;

      const pagas = pagasRes.data ?? [];
      // Sobreposição, não igualdade: a liquidação guarda o período dos
      // movimentos que apanhou, que pode ser mais estreito do que a semana.
      const jaLiquidada = (linha: {
        motorista_id: string;
        semana_inicio: string;
        semana_fim: string;
      }) =>
        pagas.some(
          (p) =>
            p.motorista_id === linha.motorista_id &&
            p.periodo_inicio <= linha.semana_fim &&
            p.periodo_fim >= linha.semana_inicio
        );

      const porCobrar = (negativasRes.data ?? []).filter((l) => !jaLiquidada(l));

      if (porCobrar.length === 0) return vazio;

      return {
        motoristas: new Set(porCobrar.map((l) => l.motorista_id)).size,
        semanas: new Set(porCobrar.map((l) => l.semana_inicio)).size,
        total: porCobrar.reduce((soma, l) => soma + Math.abs(Number(l.liquido)), 0),
        // A consulta vem ordenada por semana ascendente: a primeira é a mais antiga.
        maisAntiga: {
          inicio: porCobrar[0].semana_inicio,
          fim: porCobrar[0].semana_fim,
        },
      };
    },
  });
}
