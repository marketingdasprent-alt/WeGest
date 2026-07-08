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
        .is('substituido_em', null)
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

/** Contrato anterior/seguinte por código — para as setas de navegação no
 *  topo da página do contrato. Ignora versões substituídas (histórico). */
export function useContratoVizinhos(codigoAtual: number | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'vizinhos', codigoAtual ?? null],
    queryFn: async (): Promise<{
      anterior: ContratoRefResumo | null;
      seguinte: ContratoRefResumo | null;
    }> => {
      if (codigoAtual == null) return { anterior: null, seguinte: null };
      const [anteriorRes, seguinteRes] = await Promise.all([
        supabase
          .from('contratos_renting')
          .select('id, codigo')
          .is('deleted_at', null)
          .is('substituido_em', null)
          .lt('codigo', codigoAtual)
          .order('codigo', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('contratos_renting')
          .select('id, codigo')
          .is('deleted_at', null)
          .is('substituido_em', null)
          .gt('codigo', codigoAtual)
          .order('codigo', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      if (anteriorRes.error) throw anteriorRes.error;
      if (seguinteRes.error) throw seguinteRes.error;
      return {
        anterior: (anteriorRes.data as ContratoRefResumo | null) ?? null,
        seguinte: (seguinteRes.data as ContratoRefResumo | null) ?? null,
      };
    },
    enabled: codigoAtual != null,
    staleTime: 10_000,
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

/** Extrai a mensagem de erro tanto de Error quanto de PostgrestError — este
 *  último é um objecto plain (tem .message, mas NÃO é instanceof Error),
 *  por isso um check `error instanceof Error` sozinho falha sempre para
 *  erros do Supabase e mascara a causa real atrás de "Erro inesperado". */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
  }
  return String(error);
}

export function isConflictError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: string }).code;
  if (code === '23P01') return true; // exclusion_violation
  const message = errorMessage(error);
  return (
    message.includes('contratos_no_overbooking') ||
    message.includes('Conflito: viatura já tem reserva')
  );
}

export function contratoErrorMessage(error: unknown): { title: string; description: string } {
  if (isConflictError(error)) {
    return {
      title: 'Conflito de disponibilidade',
      description: 'A viatura já tem contrato ou reserva activa sobreposta neste período.',
    };
  }
  const code = (error as { code?: string }).code;
  const message = errorMessage(error);
  if (code === '23505' && message.includes('uq_contratos_renting_reserva_id_active')) {
    return {
      title: 'Reserva já tem contrato',
      description:
        'Esta reserva já deu origem a um contrato. Abre o contrato existente em vez de criar outro.',
    };
  }
  return { title: 'Erro', description: message };
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
      qc.invalidateQueries({ queryKey: ['contrato-historico'] });
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

/** Dados da recolha (KM/combustível/fotos) preenchidos já no fecho do
 *  contrato, sem passar pelo fluxo separado de QR/Calendário. */
export interface FecharContratoRecolhaInfo {
  km: string;
  combustivel: string;
  fotos: File[];
}

export interface FecharContratoTVDEArgs {
  contratoId: string;
  contratoCodigo: number;
  tipoEvento: 'recolhido' | 'devolvido';
  estacaoId: string;
  dataEvento: string;
  motivo?: string;
  valorDivida?: number;
  motoristaId?: string | null;
  matricula?: string | null;
  viaturaId?: string | null;
  recolha?: FecharContratoRecolhaInfo;
}

export function useFecharContratoTVDE() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      contratoId,
      contratoCodigo,
      tipoEvento,
      estacaoId,
      dataEvento,
      motivo,
      valorDivida,
      motoristaId,
      matricula,
      viaturaId,
      recolha,
    }: FecharContratoTVDEArgs): Promise<void> => {
      const { data: estacao, error: errEstacao } = await supabase
        .from('estacoes')
        .select('nome, cidade')
        .eq('id', estacaoId)
        .single();
      if (errEstacao) throw errEstacao;
      const cidadeEvento = estacao.cidade?.trim() || estacao.nome;

      const { error: errUpdate } = await supabase
        .from('contratos_renting')
        .update({ estado_operacional: 'cancelado', estacao_recolha_id: estacaoId })
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

      // Se a recolha for registada já aqui (km/combustível/fotos), o evento
      // nasce directamente marcado como realizado — não fica pendente à
      // espera do fluxo de QR/Calendário.
      const { error: errEvento } = await supabase.from('calendario_eventos').insert({
        tipo: tipoCalendario,
        titulo: matriculaNorm ?? '?',
        descricao: descricaoEvento,
        cidade: cidadeEvento,
        data_inicio: dataEvento,
        data_fim: dataEvento,
        dia_todo: false,
        matricula_devolver: matriculaNorm,
        origem_tipo: 'contrato_renting',
        origem_id: contratoId,
        criado_por: userId,
        ...(recolha ? { realizado_em: new Date().toISOString(), realizado_por_id: userId } : {}),
      });
      if (errEvento) throw errEvento;

      // Regista a condição da viatura (km/combustível/fotos) já no fecho.
      // km_entrada/combustivel_entrada — mesmas colunas que a Recolha via
      // QR/RealizarEntregaPage usa (migration 20260702102439), para a Folha
      // de Danos e o contexto do contrato lerem o valor certo independente
      // do caminho por onde a recolha foi registada.
      if (recolha) {
        const kmNum = Number(recolha.km);
        const { error: errKm } = await supabase
          .from('contratos_renting')
          .update({
            km_entrada: Number.isNaN(kmNum) ? null : kmNum,
            combustivel_entrada: recolha.combustivel,
          })
          .eq('id', contratoId);
        if (errKm) throw errKm;

        if (viaturaId && !Number.isNaN(kmNum)) {
          await supabase.from('viaturas').update({ km_atual: kmNum }).eq('id', viaturaId);
        }

        // Fotos gravadas como viatura_danos/viatura_dano_fotos — mesmo modelo
        // que RealizarEntregaPage usa — para a Folha de Danos as apanhar
        // automaticamente (fetchAnexoDanos lê desta tabela). Todas as fotos
        // desta recolha ficam num único registo "Registo recolha" (uma
        // galeria), em vez de um registo por foto.
        if (recolha.fotos.length > 0 && viaturaId) {
          const { data: dano, error: dErr } = await supabase
            .from('viatura_danos')
            .insert({
              viatura_id: viaturaId,
              descricao: 'Registo recolha',
              observacoes: motivo?.trim() || null,
              estado: 'existente',
              contrato_renting_id: contratoId,
              registado_por: userId,
            })
            .select('id')
            .single();
          if (dErr) throw dErr;

          for (const file of recolha.fotos) {
            const ext = file.name.split('.').pop() || 'bin';
            const path = `${dano.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from('viatura-danos')
              .upload(path, file, { contentType: file.type });
            if (upErr) throw upErr;
            const { error: fErr } = await supabase.from('viatura_dano_fotos').insert({
              dano_id: dano.id,
              ficheiro_url: path,
              nome_ficheiro: file.name,
              uploaded_by: userId,
            });
            if (fErr) throw fErr;
          }
        }
      }

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

      // Fechar o contrato termina o vínculo TVDE em curso — o motorista fica
      // inactivo automaticamente até ser associado a um novo contrato/viatura.
      if (motoristaId) {
        const { error: errMotorista } = await supabase
          .from('motoristas_ativos')
          .update({ status_ativo: false })
          .eq('id', motoristaId);
        if (errMotorista) throw errMotorista;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      qc.invalidateQueries({ queryKey: ['motoristas'] });
      toast({ title: 'Contrato fechado' });
    },
    onError: (error: unknown) => {
      const { title, description } = contratoErrorMessage(error);
      toast({ title, description, variant: 'destructive' });
    },
  });
}

// ────────────────────────────────────────────────────────────
// Marcar entrega/recolha como já realizada, sem o fluxo de check
// (fotos/km/QR) — atalho para contratos antigos/legado (ex.: migrados de
// outro sistema) onde a informação de check-in nunca existiu.
// ────────────────────────────────────────────────────────────

export interface MarcarRealizacaoDiretaArgs {
  contratoId: string;
  tipo: 'entrega' | 'recolha';
}

export function useMarcarRealizacaoDireta() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ contratoId, tipo }: MarcarRealizacaoDiretaArgs): Promise<void> => {
      const novoEstado = tipo === 'entrega' ? 'em_curso' : 'devolvido';
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Muda estado_operacional — dispara trg_contrato_renting_cascata_realizacao,
      // que marca o evento de calendário (entrega/recolha) pendente como
      // realizado, sem passar pelo fluxo de check (fotos/km/QR).
      const { error } = await supabase
        .from('contratos_renting')
        .update({ estado_operacional: novoEstado, updated_by: user?.id ?? null })
        .eq('id', contratoId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      qc.invalidateQueries({ queryKey: ['calendario-eventos'] });
      qc.invalidateQueries({ queryKey: ['calendario', 'eventos-pendentes-renting'] });
      qc.invalidateQueries({ queryKey: ['calendario-evento-pendente'] });
      toast({
        title:
          vars.tipo === 'entrega'
            ? 'Entrega marcada como realizada'
            : 'Recolha marcada como realizada',
        description: 'Sem fotos/km — apenas o estado do contrato foi actualizado.',
      });
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
