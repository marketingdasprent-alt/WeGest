import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ParcelaPlano, FrequenciaParcela } from '@/lib/parcelamento';

const QUERY_KEY_BASE = ['acordos-pagamento'] as const;

export interface AcordoAtivoInfo {
  id: string;
  codigo: number;
  estado: string;
}

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

      return data as unknown as AcordoAtivoInfo | null;
    },
    enabled: !!cobrancaId,
    staleTime: 15_000,
  });
}

export function useAcordosAtivosPorCobrancas(cobrancaIds: string[]) {
  const key = [...cobrancaIds].sort().join(',');
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'ativos-lote', key],
    queryFn: async (): Promise<Map<string, AcordoAtivoInfo>> => {
      if (cobrancaIds.length === 0) return new Map();
      const { data, error } = await supabase
        .from('acordos_pagamento' as any)
        .select('id, codigo, estado, cobranca_id')
        .in('cobranca_id', cobrancaIds)
        .in('estado', ['ativo', 'incumprimento']);
      if (error) throw error;
      const rows = data as unknown as Array<AcordoAtivoInfo & { cobranca_id: string }>;
      return new Map(rows.map((r) => [r.cobranca_id, r]));
    },
    enabled: cobrancaIds.length > 0,
    staleTime: 15_000,
  });
}

export interface CobrancaCedida {
  motoristaId: string;
  nome: string | null;
}

export function useCobrancaCedida(cobrancaId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'cedida', cobrancaId ?? null],
    queryFn: async (): Promise<CobrancaCedida | null> => {
      if (!cobrancaId) return null;
      const { data, error } = await supabase
        .from('contrato_cobrancas')
        .select('responsavel_motorista_id, motoristas_ativos(nome)')
        .eq('id', cobrancaId)
        .maybeSingle();
      if (error) throw error;
      const row = data as unknown as {
        responsavel_motorista_id: string | null;
        motoristas_ativos: { nome: string | null } | null;
      } | null;
      if (!row?.responsavel_motorista_id) return null;
      return {
        motoristaId: row.responsavel_motorista_id,
        nome: row.motoristas_ativos?.nome ?? null,
      };
    },
    enabled: !!cobrancaId,
    staleTime: 15_000,
  });
}

export interface ResponsavelElegivel {
  papel: 'condutor' | 'motorista';

  id: string;
  nome: string | null;
}

export function useAcordoResponsaveisElegiveis(contratoId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'responsaveis', contratoId ?? null],
    queryFn: async (): Promise<ResponsavelElegivel[]> => {
      if (!contratoId) return [];
      const { data, error } = await supabase
        .from('contrato_condutores')
        .select('cliente_id, motorista_id, clientes(nome), motoristas_ativos(nome)')
        .eq('contrato_id', contratoId)
        .is('data_fim', null);
      if (error) throw error;

      return (data ?? [])
        .filter((c) => !!c.motorista_id || !!c.cliente_id)
        .map(
          (c): ResponsavelElegivel =>
            c.motorista_id
              ? {
                  papel: 'motorista',
                  id: c.motorista_id as string,
                  nome: c.motoristas_ativos?.nome ?? null,
                }
              : {
                  papel: 'condutor',
                  id: c.cliente_id as string,
                  nome: c.clientes?.nome ?? null,
                }
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

const PARCELA_ESTADOS_LIQUIDADOS = new Set(['paga', 'liquidacao_pendente']);

export interface AcordoAtivoResumo {
  id: string;
  codigo: number;
  estado: string;

  faltaPagar: number;
  parcelasPagas: number;
  parcelasTotal: number;

  proximaData: string | null;

  outrosAtivos: number;
}

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
