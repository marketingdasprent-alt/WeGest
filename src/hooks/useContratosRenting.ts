import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { semCodigo } from '@/types/codigoPorOrg';
import type {
  ContratoRenting,
  ContratoEstadoOperacional,
  ContratoEstadoFinanceiro,
  ContratoRentingInsert,
  ContratoRentingUpdate,
} from '@/types/contratoRenting';

const QUERY_KEY_BASE = ['renting', 'contratos'] as const;

// Ocupação de viaturas (badge de Frota + seletor de viaturas por período).
// Um contrato ocupa a viatura, por isso qualquer mutação de contrato tem de
// invalidar estas queries — senão o seletor continua a mostrar a viatura como
// ocupada depois de o contrato ser fechado/cancelado (a query fica em cache
// com a data pedida como chave e só refrescava ao mudar a data). Ver Erro 4.
function invalidarOcupacaoViaturas(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['viaturas-ocupadas-periodo'] });
  qc.invalidateQueries({ queryKey: ['viaturas-ocupacao-atual'] });
}

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
  tarifa_diaria, tarifa_id, desconto_percentagem, taxa_iva, valor_total_manual,
  total_subtotal, total_iva, total_final, facturado_em,
  is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias,
  franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
  km_saida, km_entrada,
  combustivel_saida, eletricidade_saida,
  entrega_via_any_rent,
  dua_original_com_motorista, dua_devolvida_em, dua_observacoes,
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
      const contratos = (data ?? []) as unknown as ContratoRenting[];
      if (contratos.length === 0) return contratos;

      // Merge do total calculado (view contrato_renting_totais) para que a
      // listagem mostre tarifa + extras + coberturas + taxas + IVA em tempo
      // real, e não apenas o valor_total_manual (base sem extras/IVA).
      const ids = contratos.map((c) => c.id);
      const { data: totais, error: errTotais } = await supabase
        .from('contrato_renting_totais')
        .select('contrato_id, total')
        .in('contrato_id', ids);
      if (errTotais) throw errTotais;
      const totalById = new Map<string, number | null>();
      (totais ?? []).forEach((t) => {
        const row = t as { contrato_id: string | null; total: number | null };
        if (row.contrato_id) totalById.set(row.contrato_id, row.total);
      });
      return contratos.map((c) => ({ ...c, total_calculado: totalById.get(c.id) ?? null }));
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
      return data as unknown as ContratoRenting | null;
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
        .insert(semCodigo<'contratos_renting'>(payload))
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return data as unknown as ContratoRenting;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      invalidarOcupacaoViaturas(qc);
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
      return data as unknown as ContratoRenting;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      invalidarOcupacaoViaturas(qc);
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
// Fechar contrato (TVDE e rent-a-car — mesmo fluxo para ambos)
// ────────────────────────────────────────────────────────────

/** Dados da recolha (KM/combustível/fotos) preenchidos já no fecho do
 *  contrato, sem passar pelo fluxo separado de QR/Calendário. */
export interface FecharContratoRecolhaInfo {
  km: string;
  combustivel: string;
  fotos: File[];
}

export interface FecharContratoArgs {
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
  /** true quando o motorista tinha levado a DUA original e o gestor confirma a
   *  devolução no fecho — grava dua_devolvida_em = now() no contrato. */
  marcarDuaDevolvida?: boolean;
  /** Força o fecho a ser tratado como definitivo (motorista desactivado,
   *  toast "Contrato fechado") mesmo sem `recolha` — usado pelo fecho
   *  simplificado de viaturas slot, que não captura km/combustível/fotos mas
   *  fecha o contrato por completo na mesma (não fica "a aguardar recolha"). */
  fecharAgora?: boolean;
}

/** Título/descrição do toast final — depende de a recolha ter sido
 *  confirmada já aqui (`fechouAgora`) ou só agendada para mais tarde. */
export function resolveFechoContratoToast(fechouAgora: boolean): {
  title: string;
  description?: string;
} {
  return fechouAgora
    ? { title: 'Contrato fechado' }
    : {
        title: 'Recolha agendada',
        description: 'O contrato mantém-se em curso até a recolha ser confirmada.',
      };
}

export function useFecharContrato() {
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
      marcarDuaDevolvida,
      fecharAgora,
    }: FecharContratoArgs): Promise<{ fechouAgora: boolean }> => {
      const { data: estacao, error: errEstacao } = await supabase
        .from('estacoes')
        .select('nome, cidade')
        .eq('id', estacaoId)
        .single();
      if (errEstacao) throw errEstacao;
      const cidadeEvento = estacao.cidade?.trim() || estacao.nome;

      // Fechar o contrato é uma decisão explícita do gestor: passa sempre a
      // 'cancelado' (fechado), quer a recolha física seja registada já aqui
      // (km/combustível/fotos, `recolha` presente) quer fique para confirmar
      // depois via QR/Calendário. Antes, sem `recolha`, o estado não mudava e
      // o contrato ficava preso (parecia que não fechava) à espera de uma
      // confirmação que muitas vezes nunca chegava.
      const { error: errUpdate } = await supabase
        .from('contratos_renting')
        .update({
          estacao_recolha_id: estacaoId,
          estado_operacional: 'cancelado' as const,
          // Fecha o ciclo da DUA original: se o motorista a tinha levado e o
          // gestor confirmou a devolução, regista o momento.
          ...(marcarDuaDevolvida ? { dua_devolvida_em: new Date().toISOString() } : {}),
        })
        .eq('id', contratoId);
      if (errUpdate) throw errUpdate;

      // Evento no calendário com a data escolhida pelo gestor
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;
      if (!userId) throw new Error('Sessão não encontrada');

      // Sempre 'recolha' no calendário — é o único tipo que o fluxo de
      // renting (useEventosPendentesRenting, realizar_token_realizacao)
      // reconhece como pendente de confirmação para contratos_renting.
      // 'devolucao' pertence ao sistema legado de `contratos` (não-renting)
      // e ficaria órfão (invisível/impossível de confirmar) aqui.
      const tipoCalendario = 'recolha';
      const matriculaNorm = matricula ? matricula.replace(/[\s-]/g, '').toUpperCase() : null;
      const descricaoEvento = [motivo || null, `Fecho do contrato #${contratoCodigo}`]
        .filter(Boolean)
        .join(' — ');

      // Se a recolha for registada já aqui (km/combustível/fotos), o evento
      // nasce directamente marcado como realizado — não fica pendente à
      // espera do fluxo de QR/Calendário. Caso contrário fica pendente e é o
      // fluxo de QR/Calendário (realizar_token_realizacao) que, ao confirmar,
      // marca o evento como realizado e só então fecha o contrato.
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
      // Acontece quando a recolha física já foi confirmada aqui (senão o
      // motorista continua de posse da viatura até a recolha real acontecer)
      // ou quando o fecho é forçado como definitivo (fecharAgora — slot, que
      // não tem recolha física a capturar mas fecha por completo na mesma).
      if (motoristaId && (recolha || fecharAgora)) {
        const { error: errMotorista } = await supabase
          .from('motoristas_ativos')
          .update({ status_ativo: false })
          .eq('id', motoristaId);
        if (errMotorista) throw errMotorista;
      }

      return { fechouAgora: !!recolha || !!fecharAgora };
    },
    onSuccess: ({ fechouAgora }) => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      invalidarOcupacaoViaturas(qc);
      qc.invalidateQueries({ queryKey: ['motoristas'] });
      qc.invalidateQueries({ queryKey: ['calendario', 'eventos-pendentes-renting'] });
      toast(resolveFechoContratoToast(fechouAgora));
    },
    onError: (error: unknown) => {
      const { title, description } = contratoErrorMessage(error);
      toast({ title, description, variant: 'destructive' });
    },
  });
}

// ────────────────────────────────────────────────────────────
// Marcar ENTREGA como já realizada, sem o fluxo de check (fotos/km/QR) —
// atalho para contratos antigos/legado (ex.: migrados de outro sistema)
// onde a informação de check-in nunca existiu. Só entrega: recolha/fecho
// têm sempre de passar por "Fechar contrato", pelo fluxo QR ou por troca
// de viatura — um clique aqui não pode encerrar um contrato sozinho (foi
// exactamente isso que aconteceu por engano ao contrato #587, quando o
// banner de recolha apareceu cedo demais).
// ────────────────────────────────────────────────────────────

export interface MarcarRealizacaoDiretaArgs {
  contratoId: string;
}

export function useMarcarRealizacaoDireta() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ contratoId }: MarcarRealizacaoDiretaArgs): Promise<void> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Muda estado_operacional — dispara trg_contrato_renting_cascata_realizacao,
      // que marca o evento de calendário de entrega pendente como realizado,
      // sem passar pelo fluxo de check (fotos/km/QR). Guard no estado de
      // origem: só avança agendado→em_curso.
      const { error } = await supabase
        .from('contratos_renting')
        .update({
          estado_operacional: 'em_curso',
          entrega_via_any_rent: true,
          updated_by: user?.id ?? null,
        })
        .eq('id', contratoId)
        .eq('estado_operacional', 'agendado');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      invalidarOcupacaoViaturas(qc);
      qc.invalidateQueries({ queryKey: ['calendario-eventos'] });
      qc.invalidateQueries({ queryKey: ['calendario', 'eventos-pendentes-renting'] });
      qc.invalidateQueries({ queryKey: ['calendario-evento-pendente'] });
      toast({
        title: 'Entrega marcada como realizada',
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
// Preencher manualmente km/combustível/bateria de saída — só para
// contratos marcados com entrega_via_any_rent=true (ver
// useMarcarRealizacaoDireta), que saltaram o check-in e por isso nunca
// tiveram estes campos escritos. Ver AnyRentDadosSaidaAlert.tsx para a UI.
// ────────────────────────────────────────────────────────────

export interface PreencherDadosSaidaAnyRentArgs {
  contratoId: string;
  kmSaida: number;
  combustivelSaida: string | null;
  eletricidadeSaida: string | null;
}

export function usePreencherDadosSaidaAnyRent() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      contratoId,
      kmSaida,
      combustivelSaida,
      eletricidadeSaida,
    }: PreencherDadosSaidaAnyRentArgs): Promise<void> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('contratos_renting')
        .update({
          km_saida: kmSaida,
          combustivel_saida: combustivelSaida,
          eletricidade_saida: eletricidadeSaida,
          updated_by: user?.id ?? null,
        })
        .eq('id', contratoId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      toast({
        title: 'Dados de saída preenchidos',
        description: 'Km, combustível/bateria registados no contrato.',
      });
    },
    onError: (error: unknown) => {
      const { title, description } = contratoErrorMessage(error);
      toast({ title, description, variant: 'destructive' });
    },
  });
}

// ────────────────────────────────────────────────────────────
// Reverter abertura / reverter fecho — corrige um estado_operacional
// indevido (ex.: clique em falso no Any Rent) sem editar a BD à mão.
// As cascatas (trg_contrato_renting_cascata_realizacao,
// contrato_renting_cascata_estado, contrato_renting_inativar_motorista_
// na_devolucao) só reconhecem as transições "para a frente" — nenhuma
// delas desfaz nada ao andar para trás. Por isso estes hooks repõem à mão
// exactamente o que essas cascatas teriam desfeito: o evento de
// calendário pendente, o estado da reserva e a activação do motorista.
// A disponibilidade da viatura (recalcular_disponibilidade_viatura) não
// precisa de ajuda — recalcula sempre do zero a partir dos contratos/
// reservas activos, por isso corrige-se sozinha em qualquer sentido.
// ────────────────────────────────────────────────────────────

/** em_curso → agendado. A entrega volta a ficar pendente. */
export function useReverterAbertura() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (contratoId: string): Promise<void> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: updated, error } = await supabase
        .from('contratos_renting')
        .update({ estado_operacional: 'agendado', updated_by: user?.id ?? null })
        .eq('id', contratoId)
        .eq('estado_operacional', 'em_curso')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!updated) return;

      const { error: errEvento } = await supabase
        .from('calendario_eventos')
        .update({ realizado_em: null, realizado_por_id: null })
        .eq('origem_tipo', 'contrato_renting')
        .eq('origem_id', contratoId)
        .eq('tipo', 'entrega')
        .not('realizado_em', 'is', null);
      if (errEvento) throw errEvento;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      invalidarOcupacaoViaturas(qc);
      qc.invalidateQueries({ queryKey: ['calendario-eventos'] });
      qc.invalidateQueries({ queryKey: ['calendario', 'eventos-pendentes-renting'] });
      qc.invalidateQueries({ queryKey: ['calendario-evento-pendente'] });
      toast({
        title: 'Abertura revertida',
        description: 'O contrato voltou a "Agendado" — a entrega volta a ficar pendente.',
      });
    },
    onError: (error: unknown) => {
      const { title, description } = contratoErrorMessage(error);
      toast({ title, description, variant: 'destructive' });
    },
  });
}

export type ReverterFechoArgs = Pick<
  ContratoRenting,
  'id' | 'codigo' | 'regime' | 'matricula' | 'data_fim' | 'estacao_recolha_id' | 'reserva_id'
>;

/** devolvido OU cancelado → em_curso. A recolha volta a ficar pendente. */
export function useReverterFecho() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (contrato: ReverterFechoArgs): Promise<void> => {
      const {
        id: contratoId,
        codigo,
        regime,
        matricula,
        data_fim,
        estacao_recolha_id,
        reserva_id,
      } = contrato;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      const { data: updated, error } = await supabase
        .from('contratos_renting')
        .update({ estado_operacional: 'em_curso', updated_by: userId })
        .eq('id', contratoId)
        .in('estado_operacional', ['devolvido', 'cancelado'])
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!updated) return;

      // contrato_renting_cascata_estado só cascateia AO fechar — não desfaz
      // nada ao reabrir. Repomos a reserva ao estado que a abertura
      // original lhe deu (contrato_renting_cascata_open).
      if (reserva_id) {
        const { error: errReserva } = await supabase
          .from('reservas')
          .update({ estado: 'em_curso' })
          .eq('id', reserva_id);
        if (errReserva) throw errReserva;
      }

      // Reabre o evento de recolha se ainda existir marcado como realizado
      // (caso 'devolvido' — a cascata de fecho preserva-o). Se não existir
      // nenhuma linha para reabrir, foi apagado pela cascata de 'cancelado'
      // — recria-se, excepto em TVDE (nunca teve este evento; fecha sempre
      // via "Fechar contrato").
      const { data: reaberto, error: errReabrir } = await supabase
        .from('calendario_eventos')
        .update({ realizado_em: null, realizado_por_id: null })
        .eq('origem_tipo', 'contrato_renting')
        .eq('origem_id', contratoId)
        .eq('tipo', 'recolha')
        .not('realizado_em', 'is', null)
        .select('id');
      if (errReabrir) throw errReabrir;

      if ((reaberto?.length ?? 0) === 0 && regime !== 'tvde' && data_fim) {
        let cidadeRecolha: string | null = null;
        if (estacao_recolha_id) {
          const { data: estacao } = await supabase
            .from('estacoes')
            .select('nome, cidade')
            .eq('id', estacao_recolha_id)
            .maybeSingle();
          cidadeRecolha = estacao ? estacao.cidade?.trim() || estacao.nome : null;
        }
        const matriculaNorm = matricula ? matricula.replace(/[\s-]/g, '').toUpperCase() : null;
        const { error: errInsert } = await supabase.from('calendario_eventos').insert({
          tipo: 'recolha',
          titulo: matriculaNorm ?? '?',
          descricao: `Reaberto automaticamente — reversão do fecho do contrato #${codigo}`,
          cidade: cidadeRecolha,
          data_inicio: data_fim,
          data_fim: data_fim,
          dia_todo: false,
          matricula_devolver: matriculaNorm,
          origem_tipo: 'contrato_renting',
          origem_id: contratoId,
          criado_por: userId,
        });
        if (errInsert) throw errInsert;
      }

      // Espelha (ao contrário) a desactivação automática do motorista no
      // fecho (contrato_renting_inativar_motorista_na_devolucao) — senão o
      // condutor ficava preso a "inactivo" com o contrato outra vez em curso.
      const { data: condutores } = await supabase
        .from('contrato_condutores')
        .select('motorista_id')
        .eq('contrato_id', contratoId)
        .not('motorista_id', 'is', null);
      const motoristaIds = (condutores ?? [])
        .map((c) => c.motorista_id as string | null)
        .filter((id): id is string => !!id);
      if (motoristaIds.length > 0) {
        const { error: errMotorista } = await supabase
          .from('motoristas_ativos')
          .update({ status_ativo: true })
          .in('id', motoristaIds);
        if (errMotorista) throw errMotorista;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      invalidarOcupacaoViaturas(qc);
      qc.invalidateQueries({ queryKey: ['motoristas'] });
      qc.invalidateQueries({ queryKey: ['calendario-eventos'] });
      qc.invalidateQueries({ queryKey: ['calendario', 'eventos-pendentes-renting'] });
      qc.invalidateQueries({ queryKey: ['calendario-evento-pendente'] });
      toast({
        title: 'Fecho revertido',
        description: 'O contrato voltou a "Em curso" — a recolha volta a ficar pendente.',
      });
    },
    onError: (error: unknown) => {
      const { title, description } = contratoErrorMessage(error);
      toast({ title, description, variant: 'destructive' });
    },
  });
}

export type ReverterParaReservaArgs = Pick<ContratoRenting, 'id' | 'reserva_id'>;

/** agendado → apaga o contrato (soft-delete) e devolve a reserva de origem
 *  ao estado activo — desfaz a conversão reserva→contrato por completo, não
 *  só o estado_operacional. Só faz sentido antes de a viatura ser entregue
 *  (agendado): depois disso já não é "só uma reserva outra vez" — é para
 *  isso que existem "Reverter abertura"/"Reverter fecho". */
export function useReverterParaReserva() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id: contratoId, reserva_id }: ReverterParaReservaArgs): Promise<void> => {
      if (!reserva_id) throw new Error('Este contrato não tem reserva de origem.');

      const { data: updated, error } = await supabase
        .from('contratos_renting')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', contratoId)
        .eq('estado_operacional', 'agendado')
        .is('deleted_at', null)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!updated) return;

      // Devolve a reserva ao estado que tinha antes de virar contrato — o
      // mesmo valor que contrato_renting_cascata_estado usa para "cancelado
      // vindo de agendado" (cliente continua com reserva válida).
      const { error: errReserva } = await supabase
        .from('reservas')
        .update({ estado: 'confirmada' })
        .eq('id', reserva_id);
      if (errReserva) throw errReserva;

      // O contrato deixou de existir — os eventos de entrega/recolha que
      // contrato_renting_cascata_open criou ao abri-lo ficariam órfãos,
      // ainda pendentes, nas listas do Calendário. Mesma limpeza que a
      // cascata de 'cancelado' já faz para contratos que chegam a abrir.
      const { error: errEventos } = await supabase
        .from('calendario_eventos')
        .delete()
        .eq('origem_tipo', 'contrato_renting')
        .eq('origem_id', contratoId);
      if (errEventos) throw errEventos;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      invalidarOcupacaoViaturas(qc);
      qc.invalidateQueries({ queryKey: ['renting', 'reservas'] });
      qc.invalidateQueries({ queryKey: ['calendario-eventos'] });
      qc.invalidateQueries({ queryKey: ['calendario', 'eventos-pendentes-renting'] });
      toast({
        title: 'Contrato revertido para reserva',
        description: 'O contrato foi removido — volta a ser só uma reserva.',
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
      invalidarOcupacaoViaturas(qc);
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

/**
 * Renova um contrato rent-a-car de longa duração (RPC renovar_contrato_renting):
 * fecha o mês actual (passa a histórico) e cria o mês seguinte por faturar, com
 * código novo. Devolve o id do novo contrato (para navegar). O feedback (toast /
 * navegação) é tratado no diálogo de confirmação.
 */
export function useRenovarContrato() {
  const qc = useQueryClient();

  return useMutation<
    string,
    Error,
    { contratoId: string; kmInicio?: number | null; kmFim?: number | null }
  >({
    mutationFn: async ({ contratoId, kmInicio, kmFim }): Promise<string> => {
      // A RPC ainda não consta dos tipos gerados — cast controlado.
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: string | null; error: { message: string } | null }>
      )('renovar_contrato_renting', {
        p_contrato_id: contratoId,
        p_km_inicio: kmInicio ?? null,
        p_km_fim: kmFim ?? null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      invalidarOcupacaoViaturas(qc);
      qc.invalidateQueries({ queryKey: ['renting'] });
      qc.invalidateQueries({ queryKey: ['calendario', 'eventos-pendentes-renting'] });
    },
  });
}

/** Carrega toda a cadeia de versões de um contrato (mais recente primeiro),
 *  a partir de qualquer ponto da cadeia — inclui tanto as versões
 *  anteriores como as seguintes. Isto garante que abrir uma versão antiga
 *  (ex.: um contrato fechado por uma troca) também mostra a versão nova
 *  que a substituiu, e não só o caminho para trás. */
export function useContratoVersoes(contratoId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, 'versoes', contratoId ?? null],
    queryFn: async (): Promise<ContratoRenting[]> => {
      if (!contratoId) return [];

      const buscarPorId = async (id: string): Promise<ContratoRenting | null> => {
        const { data, error } = await supabase
          .from('contratos_renting')
          .select(SELECT_COLUMNS)
          .eq('id', id)
          .maybeSingle();
        if (error) throw error;
        return data as unknown as ContratoRenting | null;
      };

      // Sobe a cadeia via contrato_anterior_id, a partir da própria versão
      // (inclui-a) até à mais antiga.
      const anteriores: ContratoRenting[] = [];
      let cursorAtras: string | null = contratoId;
      while (cursorAtras) {
        const linha = await buscarPorId(cursorAtras);
        if (!linha) break;
        anteriores.push(linha);
        cursorAtras = linha.contrato_anterior_id;
      }
      if (anteriores.length === 0) return [];

      // Desce a cadeia para a frente (quem tem contrato_anterior_id = esta
      // versão), da própria até à mais recente. Cada versão só pode ter no
      // máximo uma seguinte (criar_versao_contrato_renting bloqueia
      // versionar um contrato já substituído), por isso .limit(1) é seguro.
      const seguintes: ContratoRenting[] = [];
      let cursorFrente: string = contratoId;
      for (;;) {
        const { data, error } = await supabase
          .from('contratos_renting')
          .select(SELECT_COLUMNS)
          .eq('contrato_anterior_id', cursorFrente)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!data) break;
        const linha = data as unknown as ContratoRenting;
        seguintes.push(linha);
        cursorFrente = linha.id;
      }

      return [...seguintes.reverse(), ...anteriores];
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
      invalidarOcupacaoViaturas(qc);
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
        p_excluir_id: excluirId ?? undefined,
        p_reserva_id: reservaId ?? undefined,
      });
      if (error) throw error;
      return Boolean(data);
    },
    enabled,
    staleTime: 10_000,
  });
}
