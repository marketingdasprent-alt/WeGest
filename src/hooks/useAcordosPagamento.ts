/**
 * Hooks do parcelamento de faturas (Fase 4A). Consomem o backend já
 * implementado e revisto (acordos_pagamento, acordo_parcelas, acordo_criar,
 * faturacao-emitir). `as any` nos nomes de tabela/RPC: types.ts ainda não foi
 * regenerado para estas tabelas — mesmo padrão de src/lib/acordoPagamento.ts.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ParcelaPlano, FrequenciaParcela } from '@/lib/parcelamento';

const QUERY_KEY_BASE = ['acordos-pagamento'] as const;

export interface AcordoAtivoInfo {
  id: string;
  codigo: number;
  estado: string;
}

/** Existe já um acordo vivo (ativo|incumprimento) sobre esta cobrança? Bloqueia o botão de parcelar. */
export function useAcordoAtivoPorCobranca(cobrancaId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'ativo', cobrancaId ?? null],
    queryFn: async (): Promise<AcordoAtivoInfo | null> => {
      if (!cobrancaId) return null;
      const { data, error } = await supabase
        .from('acordos_pagamento' as any)
        .select('id, codigo, estado')
        .eq('cobranca_id', cobrancaId)
        .in('estado', ['ativo', 'incumprimento'])
        .maybeSingle();
      if (error) throw error;
      // `acordos_pagamento` não existe em types.ts (ver nota do topo do ficheiro):
      // o select-string parser do postgrest-js não consegue validar o shape
      // contra um schema desconhecido e devolve um SelectQueryError opaco, que
      // nunca tem overlap suficiente com AcordoAtivoInfo para um cast directo —
      // daí o passo por `unknown`, tal como o próprio erro do tsc recomenda.
      return data as unknown as AcordoAtivoInfo | null;
    },
    enabled: !!cobrancaId,
    staleTime: 15_000,
  });
}

export interface ResponsavelElegivel {
  papel: 'condutor' | 'motorista';
  /** cliente_id quando papel='condutor'; motorista_id quando papel='motorista'. */
  id: string;
  nome: string | null;
}

/**
 * Candidatos a "quem assume o pagamento" além do titular: condutores/motoristas
 * ligados ao contrato. Espelha o JOIN de useContratoCondutoresPrincipais
 * (useContratoCondutores.ts), sem o filtro is_principal — precisa de todos.
 */
export function useAcordoResponsaveisElegiveis(contratoId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'responsaveis', contratoId ?? null],
    queryFn: async (): Promise<ResponsavelElegivel[]> => {
      if (!contratoId) return [];
      const { data, error } = await supabase
        .from('contrato_condutores')
        .select('cliente_id, motorista_id, clientes(nome)')
        .eq('contrato_id', contratoId)
        .is('data_fim', null);
      if (error) throw error;
      // TVDE fatura-se fora do WeGest — acordo_criar recusa sempre
      // responsavel_papel='motorista' (ver migration 20260724100001). Nunca
      // oferecer motorista como candidato elegível: seria um caminho
      // garantido a falhar, com um erro cru da BD mostrado ao utilizador.
      return (data ?? [])
        .filter((c) => !c.motorista_id && !!c.cliente_id)
        .map(
          (c): ResponsavelElegivel => ({
            papel: 'condutor',
            id: c.cliente_id as string,
            nome: c.clientes?.nome ?? null,
          })
        );
    },
    enabled: !!contratoId,
    staleTime: 30_000,
  });
}

export interface CriarAcordoInput {
  cobrancaId: string;
  responsavelPapel: 'cliente' | 'condutor' | 'motorista';
  responsavelId: string;
  parcelas: ParcelaPlano[];
  frequencia: FrequenciaParcela;
  diaVencimento?: number;
  avisoAntecedenciaDias?: number;
  observacoes?: string;
}

/**
 * Cria o acordo (RPC acordo_criar — transacional, backend Tarefa 3). Só
 * invalida a query de "acordo vivo" desta cobrança; o chamador (ParcelamentoDialog)
 * é responsável por invalidar o resto (lista de cobranças) via onCriado(),
 * exactamente como RecibosDialog.onEmitido já funciona.
 */
export function useCriarAcordo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CriarAcordoInput): Promise<string> => {
      const { data, error } = await supabase.rpc('acordo_criar' as any, {
        p_cobranca_id: input.cobrancaId,
        p_responsavel_papel: input.responsavelPapel,
        p_responsavel_id: input.responsavelId,
        p_parcelas: input.parcelas,
        p_frequencia: input.frequencia,
        p_dia_vencimento: input.diaVencimento ?? null,
        p_aviso_antecedencia_dias: input.avisoAntecedenciaDias ?? 3,
        p_observacoes: input.observacoes ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [...QUERY_KEY_BASE, 'ativo', vars.cobrancaId] });
    },
  });
}

/**
 * Parcelas que já contam como "pagas" para efeitos de progresso/próxima data no
 * cartão-resumo: 'liquidacao_pendente' entra aqui porque o dinheiro já
 * entrou (só falta o documento fiscal) — mesma leitura que a RPC
 * `acordo_vista_devedor` já faz para o devedor (ver useAcordoVistaDevedor.ts).
 */
const PARCELA_ESTADOS_LIQUIDADOS = new Set(['paga', 'liquidacao_pendente']);

export interface AcordoAtivoResumo {
  id: string;
  codigo: number;
  estado: string;
  /** Saldo por liquidar — vem de `cobranca_saldo_por_liquidar`, a mesma fonte usada em toda a feature (nunca recalculado a partir das parcelas). */
  faltaPagar: number;
  parcelasPagas: number;
  parcelasTotal: number;
  /** Vencimento da próxima parcela ainda não liquidada; null se todas já liquidadas. */
  proximaData: string | null;
  /**
   * Nº de OUTROS acordos ativos/em incumprimento desta entidade, além deste.
   * Normalmente 0 — `uq_acordo_vivo_por_cobranca` só impede duplicar por
   * cobrança, não por entidade, por isso em teoria uma entidade pode ter
   * acordos vivos em cobranças diferentes ao mesmo tempo. Em vez de construir
   * uma lista especulativa para um caso nunca visto na prática, mostra-se
   * sempre o acordo mais antigo (o que precisa de atenção há mais tempo) e
   * conta-se os restantes aqui, sem os esconder.
   */
  outrosAtivos: number;
}

/**
 * Acordo ativo (ou em incumprimento) de UM cliente — como titular OU
 * responsável (`titular_id` ou `responsavel_cliente_id`). Não existe hoje uma
 * listagem "todos os acordos de X" (só `useAcordoDetalhe(id)`, que precisa de
 * um id já conhecido, e `useAcordoAtivoPorCobranca(cobrancaId)`, que precisa
 * de uma cobrança já conhecida) — esta é essa query, pequena e dedicada.
 *
 * Só cliente: um motorista nunca pode ser titular de um acordo
 * (`acordos_pagamento.titular_id` referencia `clientes`, nunca
 * `motoristas_ativos`) nem responsável (`acordo_criar`,
 * `20260724100001_acordos_saldo_e_criar.sql:131-133`, recusa sempre
 * `p_responsavel_papel = 'motorista'` — TVDE fatura-se fora do WeGest; o
 * próprio `useAcordoResponsaveisElegiveis` acima já filtra motoristas fora da
 * lista de candidatos, pela mesma razão). Uma versão anterior desta função
 * tinha um parâmetro `tipo: 'cliente' | 'motorista'` para cobrir também o
 * financeiro do motorista — removido por ser código morto e inalcançável por
 * qualquer caminho da aplicação (achado da revisão desta tarefa), não por uma
 * mudança de regra de negócio.
 */
export function useAcordoAtivoResumoPorEntidade(clienteId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'ativo-entidade', clienteId ?? null],
    queryFn: async (): Promise<AcordoAtivoResumo | null> => {
      if (!clienteId) return null;

      const { data, error } = await supabase
        .from('acordos_pagamento' as any)
        .select('id, codigo, estado, cobranca_id')
        .in('estado', ['ativo', 'incumprimento'])
        .or(`titular_id.eq.${clienteId},responsavel_cliente_id.eq.${clienteId}`)
        .order('created_at', { ascending: true });
      if (error) throw error;
      // `acordos_pagamento` não existe em types.ts — mesmo padrão `as any` +
      // passo por `unknown` do resto deste ficheiro (ver useAcordoAtivoPorCobranca).
      const acordos = (data ?? []) as unknown as Array<{
        id: string;
        codigo: number;
        estado: string;
        cobranca_id: string;
      }>;
      if (acordos.length === 0) return null;

      const principal = acordos[0];

      const { data: parcelas, error: parcelasErr } = await supabase
        .from('acordo_parcelas' as any)
        .select('data_vencimento, estado')
        .eq('acordo_id', principal.id)
        .order('numero', { ascending: true });
      if (parcelasErr) throw parcelasErr;
      const listaParcelas = (parcelas ?? []) as unknown as Array<{
        data_vencimento: string;
        estado: string;
      }>;

      const parcelasPagas = listaParcelas.filter((p) =>
        PARCELA_ESTADOS_LIQUIDADOS.has(p.estado)
      ).length;
      const proxima = listaParcelas.find(
        (p) => !PARCELA_ESTADOS_LIQUIDADOS.has(p.estado) && p.estado !== 'cancelada'
      );

      // Fonte única de verdade do saldo por liquidar — a mesma RPC que
      // acordo_criar e useAcordoDetalhe já usam. Nunca recalcular a partir da
      // soma das parcelas: a dívida de registo pode divergir (ex.: NC lançada
      // por fora do acordo).
      const { data: faltaPagarRpc, error: faltaErr } = await supabase.rpc(
        'cobranca_saldo_por_liquidar' as any,
        { p_cobranca_id: principal.cobranca_id }
      );
      if (faltaErr) throw faltaErr;

      return {
        id: principal.id,
        codigo: principal.codigo,
        estado: principal.estado,
        faltaPagar: Number(faltaPagarRpc ?? 0),
        parcelasPagas,
        parcelasTotal: listaParcelas.length,
        proximaData: proxima?.data_vencimento ?? null,
        outrosAtivos: acordos.length - 1,
      };
    },
    enabled: !!clienteId,
    staleTime: 15_000,
  });
}

export interface PreflightResult {
  ok: boolean;
  provider?: string;
  rc_configurado: boolean;
  error?: string;
}

/** Pré-voo: esta org consegue emitir Recibos? Ver faturacao-emitir (backend Tarefa 6). */
export function useFaturacaoPreflight() {
  return useMutation({
    mutationFn: async (): Promise<PreflightResult> => {
      const { data, error } = await supabase.functions.invoke<PreflightResult>('faturacao-emitir', {
        body: { action: 'preflight' },
      });
      if (error) throw new Error(error.message || 'Falha a contactar o serviço de faturação');
      return data ?? { ok: false, rc_configurado: false, error: 'Resposta vazia do servidor' };
    },
  });
}
