import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { CHAVE_ESTATISTICAS_POR_REGRA, type RegraEstatistica } from './useAutomacaoStats';

export function useToggleAutomationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      // `.select()` deteta UPDATE filtrado por RLS que devolveria `error: null`.
      const { data, error } = await supabase
        .from('automation_rules')
        .update({ ativo })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('A regra não foi actualizada — sem permissão ou já não existe.');
      }
    },
    // A vista de estatísticas é cara; mantém o interruptor responsivo até ao refetch.
    onMutate: async ({ id, ativo }) => {
      await queryClient.cancelQueries({ queryKey: CHAVE_ESTATISTICAS_POR_REGRA });
      const anterior = queryClient.getQueryData<RegraEstatistica[]>(CHAVE_ESTATISTICAS_POR_REGRA);
      queryClient.setQueryData<RegraEstatistica[]>(CHAVE_ESTATISTICAS_POR_REGRA, (regras) =>
        regras?.map((r) => (r.rule_id === id ? { ...r, ativo } : r))
      );
      return { anterior };
    },
    onError: (_erro, _variaveis, contexto) => {
      if (contexto?.anterior) {
        queryClient.setQueryData(CHAVE_ESTATISTICAS_POR_REGRA, contexto.anterior);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE_ESTATISTICAS_POR_REGRA });
    },
  });
}

export interface AutomationRuleAcaoConfig {
  template_codigo: string;
  titulo: string;
  destinatarios_cargo_ids?: string[];
  destinatarios_estrategia?: string;
  /** `individual` limita os destinatários aos utilizadores dos cargos selecionados. */
  destinatarios_modo?: 'grupo' | 'individual';
  destinatarios_user_ids?: string[];
  enviar_email?: boolean;
  /** Evita um email por item quando um backlog é processado. */
  enviar_email_digest?: boolean;
  /** Endereços fora da WeGest — só válido numa acção de email (Fase 2). */
  destinatarios_emails_livres?: string[];
}

/** Usa identificadores do catálogo, consumidos diretamente pelo motor. */
export interface AcaoInternaConfig {
  accao: string;
  campo?: string;
  valor: string;
}

export interface CondicaoTipada {
  campo: string;
  operador: string;
  valor: string | number | boolean;
}

export interface AutomationRuleConfig {
  id: string;
  nome: string;
  event_type: string;
  condicoes: unknown;
  acao_tipo: string;
  acao_config: AutomationRuleAcaoConfig;
  cooldown_minutos: number;
}

export function useAutomationRuleConfig(ruleId: string | null) {
  return useQuery({
    queryKey: ['automation-rule-config', ruleId],
    queryFn: async (): Promise<AutomationRuleConfig> => {
      const { data, error } = await supabase
        .from('automation_rules')
        .select('id, nome, event_type, condicoes, acao_tipo, acao_config, cooldown_minutos')
        .eq('id', ruleId as string)
        .single();
      if (error) throw error;
      return data as unknown as AutomationRuleConfig;
    },
    enabled: !!ruleId,
  });
}

export interface Cargo {
  id: string;
  nome: string;
}

/** A RLS limita os cargos à organização do utilizador autenticado. */
export function useCargosDisponiveis() {
  return useQuery({
    queryKey: ['cargos-disponiveis'],
    queryFn: async (): Promise<Cargo[]> => {
      const { data, error } = await supabase
        .from('cargos')
        .select('id, nome')
        .order('nome', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Cargo[];
    },
    staleTime: 5 * 60_000,
  });
}

export interface UtilizadorPorCargo {
  id: string;
  nome: string;
  email: string;
  cargo_id: string;
}

interface PerfilCru {
  id: string;
  nome: string | null;
  email: string | null;
}

/** O fallback impede que perfis sem nome quebrem o modal de configuração. */
export function utilizadoresPorCargo(
  perfis: PerfilCru[],
  cargoPorUser: Record<string, string>
): UtilizadorPorCargo[] {
  return perfis.map((p) => ({
    id: p.id,
    nome: p.nome ?? p.email ?? 'Utilizador sem nome',
    email: p.email ?? '',
    cargo_id: cargoPorUser[p.id],
  }));
}

/** O cargo por organização vive em `user_organizacoes`, não no campo legado de perfil. */
export function useUtilizadoresPorCargo(cargoIds: string[]) {
  return useQuery({
    queryKey: ['utilizadores-por-cargo', cargoIds],
    queryFn: async (): Promise<UtilizadorPorCargo[]> => {
      const { data: memberships, error: mErr } = await supabase
        .from('user_organizacoes')
        .select('user_id, cargo_id')
        .in('cargo_id', cargoIds);
      if (mErr) throw mErr;
      if (!memberships || memberships.length === 0) return [];

      const userIds = memberships.map((m) => m.user_id);
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, nome, email')
        .in('id', userIds);
      if (pErr) throw pErr;

      const cargoPorUser: Record<string, string> = {};
      for (const m of memberships) {
        if (m.cargo_id) cargoPorUser[m.user_id] = m.cargo_id;
      }
      return utilizadoresPorCargo(profiles ?? [], cargoPorUser);
    },
    enabled: cargoIds.length > 0,
  });
}

export function useAtualizarConfigRegra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      acaoTipo,
      acaoConfig,
      cooldownMinutos,
      condicoes,
    }: {
      id: string;
      acaoTipo?: string;
      acaoConfig: AutomationRuleAcaoConfig | AcaoInternaConfig;
      cooldownMinutos: number;
      /** Omitir preserva condições; valores mantêm o tipo declarado. */
      condicoes?: CondicaoTipada[];
    }) => {
      const alteracao: {
        acao_config: Json;
        cooldown_minutos: number;
        condicoes?: Json;
        acao_tipo?: string;
      } = {
        acao_config: acaoConfig as unknown as Json,
        cooldown_minutos: cooldownMinutos,
      };
      if (acaoTipo) alteracao.acao_tipo = acaoTipo;
      // Omitir e enviar `[]` têm semânticas distintas na atualização.
      if (condicoes) alteracao.condicoes = condicoes as unknown as Json;

      const { error } = await supabase.from('automation_rules').update(alteracao).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automacao-estatisticas-por-regra'] });
      queryClient.invalidateQueries({ queryKey: ['automation-rule-config', variables.id] });
    },
  });
}

export interface AutomationRuleConfigComGrupo extends AutomationRuleConfig {
  grupo_id: string;
  ativo: boolean;
  org_id: string;
}

/** A consulta dupla só ocorre ao abrir o editor, fora do caminho crítico. */
export function useGrupoDeRegras(ruleId: string | null) {
  return useQuery({
    queryKey: ['grupo-de-regras', ruleId],
    queryFn: async (): Promise<AutomationRuleConfigComGrupo[]> => {
      const { data: base, error: eBase } = await supabase
        .from('automation_rules')
        .select('grupo_id')
        .eq('id', ruleId as string)
        .single();
      if (eBase) throw eBase;

      const { data, error } = await supabase
        .from('automation_rules')
        .select(
          'id, nome, event_type, condicoes, acao_tipo, acao_config, cooldown_minutos, grupo_id, ativo, org_id'
        )
        .eq('grupo_id', base.grupo_id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AutomationRuleConfigComGrupo[];
    },
    enabled: !!ruleId,
  });
}

export interface AccaoParaGravar {
  id?: string;
  acaoTipo: string;
  acaoConfig: AutomationRuleAcaoConfig | AcaoInternaConfig;
  cooldownMinutos: number;
  condicoes?: CondicaoTipada[];
}

/** Ações novas exigem código, template e título antes de o servidor as aceitar. */
export function prepararAccaoNova(
  accao: AccaoParaGravar,
  contexto: { eventType: string; nome: string }
): { codigo: string; acaoConfig: AccaoParaGravar['acaoConfig'] } {
  // O sufixo aleatório mantém o código único por organização.
  const codigo = `${contexto.eventType}.${accao.acaoTipo}.${crypto.randomUUID().slice(0, 8)}`;

  if (accao.acaoTipo !== 'email' && accao.acaoTipo !== 'notificacao') {
    return { codigo, acaoConfig: accao.acaoConfig };
  }

  const config = accao.acaoConfig as AutomationRuleAcaoConfig;
  return {
    codigo,
    acaoConfig: {
      ...config,
      template_codigo: config.template_codigo || codigo,
      titulo: config.titulo || contexto.nome,
    } as unknown as AccaoParaGravar['acaoConfig'],
  };
}

export function useSincronizarGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      grupoId,
      orgId,
      eventType,
      nome,
      acoes,
      idsExistentes,
    }: {
      grupoId: string;
      orgId: string;
      eventType: string;
      nome: string;
      acoes: AccaoParaGravar[];
      idsExistentes: string[];
    }) => {
      const idsMantidos = new Set(acoes.map((a) => a.id).filter(Boolean));
      const idsParaApagar = idsExistentes.filter((id) => !idsMantidos.has(id));

      for (const accao of acoes) {
        if (accao.id) {
          const { error } = await supabase
            .from('automation_rules')
            .update({
              acao_config: accao.acaoConfig as unknown as Json,
              acao_tipo: accao.acaoTipo,
              cooldown_minutos: accao.cooldownMinutos,
              ...(accao.condicoes ? { condicoes: accao.condicoes as unknown as Json } : {}),
            })
            .eq('id', accao.id);
          if (error) throw error;
          continue;
        }

        const { codigo: codigoNovo, acaoConfig } = prepararAccaoNova(accao, { eventType, nome });

        // Cria o template antes do editor tentar atualizar o corpo do email.
        if (accao.acaoTipo === 'email') {
          const { error: erroTemplate } = await supabase.from('notification_templates').insert({
            org_id: orgId,
            codigo: (acaoConfig as AutomationRuleAcaoConfig).template_codigo,
            canal: 'email',
            idioma: 'pt-PT',
            assunto: nome,
            corpo_template: '',
            corpo_formato: 'text',
          });
          if (erroTemplate) throw erroTemplate;
        }

        const { error } = await supabase.from('automation_rules').insert({
          org_id: orgId,
          grupo_id: grupoId,
          codigo: codigoNovo,
          nome,
          event_type: eventType,
          acao_config: acaoConfig as unknown as Json,
          acao_tipo: accao.acaoTipo,
          cooldown_minutos: accao.cooldownMinutos,
          ...(accao.condicoes ? { condicoes: accao.condicoes as unknown as Json } : {}),
        });
        if (error) throw error;
      }

      if (idsParaApagar.length > 0) {
        const { error } = await supabase.from('automation_rules').delete().in('id', idsParaApagar);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automacao-estatisticas-por-regra'] });
      queryClient.invalidateQueries({ queryKey: ['grupo-de-regras'] });
    },
  });
}

export interface ResultadoTesteRegra {
  run_id: string;
  status: string;
  erro: string | null;
  notificacoes_criadas: number;
  emails_enfileirados: number;
  destinatarios: { nome: string | null; email: string | null }[];
}

export function useTestarRegra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const { data, error } = await supabase.rpc('testar_regra_automacao', {
        p_rule_id: ruleId,
      });
      if (error) throw error;
      return data as unknown as ResultadoTesteRegra;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automacao-estatisticas-por-regra'] });
      queryClient.invalidateQueries({ queryKey: ['automacao-timeline'] });
    },
  });
}

export function useExecutarAutomacoesManualmente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('executar_jobs_automacao_manualmente');
      if (error) throw error;
      return data as unknown as { success: boolean; executado_em: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automacao-estatisticas-por-regra'] });
      queryClient.invalidateQueries({ queryKey: ['automacao-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['automation-runs-pendentes'] });
      queryClient.invalidateQueries({ queryKey: ['failed-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['automation-runs-counts'] });
      queryClient.invalidateQueries({ queryKey: ['notification-queue-counts'] });
      queryClient.invalidateQueries({ queryKey: ['domain-events-summary'] });
      queryClient.invalidateQueries({ queryKey: ['automacao-desempenho-7-dias'] });
      queryClient.invalidateQueries({ queryKey: ['automacao-utilizacao'] });
      queryClient.invalidateQueries({ queryKey: ['automacao-saude'] });
      queryClient.invalidateQueries({ queryKey: ['automacao-atividade-14-dias'] });
    },
  });
}
