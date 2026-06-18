import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  ContratoRenting,
  ContratoEstadoOperacional,
  ContratoEstadoFinanceiro,
  ContratoRentingInsert,
  ContratoRentingUpdate,
} from '@/types/contratoRenting';

const QUERY_KEY_BASE = ['renting', 'contratos'] as const;

export interface UseContratosRentingOptions {
  estadoOperacional?: ContratoEstadoOperacional;
  estadoFinanceiro?: ContratoEstadoFinanceiro;
  viaturaId?: string;
  clienteId?: string;
  limit?: number;
  enabled?: boolean;
}

const SELECT_COLUMNS = `
  id, org_id, codigo,
  reserva_id,
  cliente_id,
  emissor_id,
  gestor_id,
  viatura_id, matricula, grupo,
  estacao_entrega_id, data_inicio,
  estacao_recolha_id, data_fim,
  estacao_origem_viatura_id,
  estado_operacional, estado_financeiro, origem, regime,
  tarifa_diaria, desconto_percentagem, taxa_iva, valor_total_manual,
  total_subtotal, total_iva, total_final, facturado_em,
  is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias,
  franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
  voucher_codigo,
  numero_processo, voo_referencia,
  local_entrega, local_recolha,
  comentarios_entrega, comentarios_recolha,
  observacoes, observacoes_internas,
  versao, contrato_anterior_id, substituido_em, motivo_versao,
  deleted_at, created_by, updated_by, created_at, updated_at
`;

export function useContratosRenting(options: UseContratosRentingOptions = {}) {
  const {
    estadoOperacional,
    estadoFinanceiro,
    viaturaId,
    clienteId,
    limit = 1000,
    enabled = true,
  } = options;

  return useQuery({
    queryKey: [
      ...QUERY_KEY_BASE,
      {
        estadoOperacional: estadoOperacional ?? null,
        estadoFinanceiro: estadoFinanceiro ?? null,
        viaturaId: viaturaId ?? null,
        clienteId: clienteId ?? null,
        limit,
      },
    ],
    queryFn: async (): Promise<ContratoRenting[]> => {
      let q = supabase
        .from('contratos_renting')
        .select(SELECT_COLUMNS)
        .is('deleted_at', null)
        .order('data_inicio', { ascending: false })
        .limit(limit);

      if (estadoOperacional) q = q.eq('estado_operacional', estadoOperacional);
      if (estadoFinanceiro) q = q.eq('estado_financeiro', estadoFinanceiro);
      if (viaturaId) q = q.eq('viatura_id', viaturaId);
      if (clienteId) q = q.eq('cliente_id', clienteId);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ContratoRenting[];
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  });
}

export interface ContratoRefResumo {
  id: string;
  codigo: number | null;
}

/**
 * Contrato ACTUAL (não substituído, não eliminado) de uma reserva, ou null.
 * Suporta a regra 1 reserva = 1 contrato no UI: se já existe, oferecemos
 * "Ver Contrato" em vez de deixar tentar criar um segundo (que a BD rejeita
 * pelo índice único parcial uq_contratos_renting_reserva_id_active).
 */
export function useContratoIdByReserva(reservaId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'by-reserva', reservaId ?? null],
    queryFn: async (): Promise<ContratoRefResumo | null> => {
      if (!reservaId) return null;
      const { data, error } = await supabase
        .from('contratos_renting')
        .select('id, codigo')
        .eq('reserva_id', reservaId)
        .is('deleted_at', null)
        .is('substituido_em', null)
        .maybeSingle();
      if (error) throw error;
      return (data as ContratoRefResumo | null) ?? null;
    },
    enabled: !!reservaId,
    staleTime: 30_000,
  });
}

// ────────────────────────────────────────────────────────────
// Totais (view contrato_renting_totais)
// ────────────────────────────────────────────────────────────

export interface ContratoTotais {
  contrato_id: string;
  dias: number;
  estado_financeiro: string;
  subtotal: number;
  iva: number;
  total: number;
  facturado_em: string | null;
  is_snapshot: boolean;
}

export function useContratoTotais(id: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'totais', id],
    queryFn: async (): Promise<ContratoTotais | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('contrato_renting_totais')
        .select('*')
        .eq('contrato_id', id)
        .maybeSingle();
      if (error) throw error;
      return data as ContratoTotais | null;
    },
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useContratoRenting(id: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'detail', id],
    queryFn: async (): Promise<ContratoRenting | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('contratos_renting')
        .select(SELECT_COLUMNS)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return data as ContratoRenting | null;
    },
    enabled: !!id,
  });
}

// ────────────────────────────────────────────────────────────
// Tratamento de erros (overbooking + conflito com reserva)
// ────────────────────────────────────────────────────────────

function isConflictError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: string }).code;
  if (code === '23P01') return true; // exclusion_violation
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('contratos_no_overbooking') ||
    message.includes('Conflito: viatura já tem reserva')
  );
}

function contratoErrorMessage(error: unknown): { title: string; description: string } {
  if (isConflictError(error)) {
    return {
      title: 'Conflito de disponibilidade',
      description: 'A viatura já tem contrato ou reserva activa sobreposta neste período.',
    };
  }
  const code = (error as { code?: string }).code;
  const message = error instanceof Error ? error.message : String(error);
  if (code === '23505' && message.includes('uq_contratos_renting_reserva_id_active')) {
    return {
      title: 'Reserva já tem contrato',
      description:
        'Esta reserva já deu origem a um contrato. Abre o contrato existente em vez de criar outro.',
    };
  }
  const description = error instanceof Error ? error.message : 'Erro inesperado';
  return { title: 'Erro', description };
}

// ────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────

export function useCreateContratoRenting() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: ContratoRentingInsert): Promise<ContratoRenting> => {
      const { data, error } = await supabase
        .from('contratos_renting')
        .insert(payload)
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return data as ContratoRenting;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      toast({ title: 'Contrato criado', description: 'O contrato foi aberto com sucesso.' });
    },
    onError: (error: unknown) => {
      const { title, description } = contratoErrorMessage(error);
      toast({ title, description, variant: 'destructive' });
    },
  });
}

export function useUpdateContratoRenting() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: ContratoRentingUpdate & { id: string }): Promise<ContratoRenting> => {
      const { data, error } = await supabase
        .from('contratos_renting')
        .update(patch)
        .eq('id', id)
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return data as ContratoRenting;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      toast({ title: 'Contrato actualizado', description: 'As alterações foram guardadas.' });
    },
    onError: (error: unknown) => {
      const { title, description } = contratoErrorMessage(error);
      toast({ title, description, variant: 'destructive' });
    },
  });
}

// ────────────────────────────────────────────────────────────
// Fechar contrato TVDE
// ────────────────────────────────────────────────────────────

export interface FecharContratoTVDEArgs {
  contratoId: string;
  contratoCodigo: number;
  tipoEvento: 'recolhido' | 'devolvido';
  dataEvento: string;
  motivo?: string;
  valorDivida?: number;
  motoristaId?: string | null;
  matricula?: string | null;
}

export function useFecharContratoTVDE() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      contratoId,
      contratoCodigo,
      tipoEvento,
      dataEvento,
      motivo,
      valorDivida,
      motoristaId,
      matricula,
    }: FecharContratoTVDEArgs): Promise<void> => {
      const { error: errUpdate } = await supabase
        .from('contratos_renting')
        .update({ estado_operacional: 'cancelado' })
        .eq('id', contratoId);
      if (errUpdate) throw errUpdate;

      // Evento no calendário com a data escolhida pelo gestor
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;

      const tipoCalendario = tipoEvento === 'recolhido' ? 'recolha' : 'devolucao';
      const matriculaNorm = matricula ? matricula.replace(/[\s-]/g, '').toUpperCase() : null;
      const descricaoEvento = [motivo || null, `Fecho do contrato #${contratoCodigo}`]
        .filter(Boolean)
        .join(' — ');

      const { error: errEvento } = await supabase.from('calendario_eventos').insert({
        tipo: tipoCalendario,
        titulo: matriculaNorm ?? '?',
        descricao: descricaoEvento,
        data_inicio: dataEvento,
        data_fim: dataEvento,
        dia_todo: false,
        matricula_devolver: matriculaNorm,
        origem_tipo: 'contrato_renting',
        origem_id: contratoId,
        criado_por: userId,
      });
      if (errEvento) throw errEvento;

      if (valorDivida && valorDivida > 0 && motoristaId) {
        const descricao = [
          `Dívida no fecho do contrato #${contratoCodigo}`,
          tipoEvento === 'recolhido' ? '(recolha)' : '(devolução)',
          motivo ? `— ${motivo}` : '',
        ]
          .filter(Boolean)
          .join(' ');

        const { error: errFin } = await supabase.from('motorista_financeiro').insert({
          motorista_id: motoristaId,
          tipo: 'debito',
          categoria: 'outro',
          descricao,
          valor: valorDivida,
          data_movimento: new Date().toISOString().split('T')[0],
          status: 'pendente',
        });
        if (errFin) throw errFin;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      toast({ title: 'Contrato fechado' });
    },
    onError: (error: unknown) => {
      const { title, description } = contratoErrorMessage(error);
      toast({ title, description, variant: 'destructive' });
    },
  });
}

// ────────────────────────────────────────────────────────────
// Versionamento (upgrade/downgrade)
// ────────────────────────────────────────────────────────────

/** Cria nova versão do contrato (clone + relações) via RPC. */
export function useCriarVersaoContrato() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (args: { contratoId: string; motivo: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('criar_versao_contrato_renting', {
        p_contrato_id: args.contratoId,
        p_motivo: args.motivo,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      toast({
        title: 'Nova versão criada',
        description: 'O contrato anterior foi marcado como substituído.',
      });
    },
    onError: (error: unknown) => {
      const description = error instanceof Error ? error.message : 'Erro inesperado';
      toast({ title: 'Erro ao criar versão', description, variant: 'destructive' });
    },
  });
}

/** Carrega a cadeia de versões anteriores de um contrato (mais recente primeiro). */
export function useContratoVersoes(contratoId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'versoes', contratoId ?? null],
    queryFn: async (): Promise<ContratoRenting[]> => {
      if (!contratoId) return [];
      // Sobe a cadeia via contrato_anterior_id usando WITH RECURSIVE via RPC.
      // Mais simples: pega o contrato actual, navega para trás iterativamente.
      const versoes: ContratoRenting[] = [];
      let cursor: string | null = contratoId;
      while (cursor) {
        const { data, error } = await supabase
          .from('contratos_renting')
          .select(SELECT_COLUMNS)
          .eq('id', cursor)
          .maybeSingle();
        if (error) throw error;
        if (!data) break;
        const linha = data as ContratoRenting;
        versoes.push(linha);
        cursor = linha.contrato_anterior_id;
      }
      return versoes;
    },
    enabled: !!contratoId,
    staleTime: 30_000,
  });
}

/** Soft delete — marca deleted_at. Hard delete fica para admin via BD. */
export function useDeleteContratoRenting() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('contratos_renting')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      toast({ title: 'Contrato eliminado', description: 'O contrato foi removido.' });
    },
    onError: (error: unknown) => {
      const description = error instanceof Error ? error.message : 'Erro inesperado';
      toast({ title: 'Erro ao eliminar', description, variant: 'destructive' });
    },
  });
}

// ────────────────────────────────────────────────────────────
// Pré-check de conflito (UX). Valida contratos E reservas.
// ────────────────────────────────────────────────────────────

export interface UseContratoConflitoArgs {
  viaturaId: string | null | undefined;
  dataInicio: Date | null | undefined;
  dataFim: Date | null | undefined;
  /** ID do próprio contrato (ao editar) — para se excluir do check. */
  excluirId?: string | null;
  /** ID da reserva associada (não conta como conflito consigo mesma). */
  reservaId?: string | null;
}

export function useContratoConflito(args: UseContratoConflitoArgs) {
  const { viaturaId, dataInicio, dataFim, excluirId, reservaId } = args;

  const enabled =
    !!viaturaId && !!dataInicio && !!dataFim && dataFim.getTime() > dataInicio.getTime();

  return useQuery({
    queryKey: [
      'renting',
      'contratos',
      'conflito',
      viaturaId ?? null,
      dataInicio?.toISOString() ?? null,
      dataFim?.toISOString() ?? null,
      excluirId ?? null,
      reservaId ?? null,
    ],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('contrato_tem_conflito', {
        p_viatura_id: viaturaId!,
        p_data_inicio: dataInicio!.toISOString(),
        p_data_fim: dataFim!.toISOString(),
        p_excluir_id: excluirId ?? null,
        p_reserva_id: reservaId ?? null,
      });
      if (error) throw error;
      return Boolean(data);
    },
    enabled,
    staleTime: 10_000,
  });
}
