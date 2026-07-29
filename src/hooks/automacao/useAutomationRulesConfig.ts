import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export function useToggleAutomationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('automation_rules').update({ ativo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automacao-estatisticas-por-regra'] });
    },
  });
}

export interface AutomationRuleAcaoConfig {
  template_codigo: string;
  titulo: string;
  destinatarios_cargo_ids?: string[];
  destinatarios_estrategia?: string;
  /** 'grupo' (default): todos os utilizadores dos destinatarios_cargo_ids.
   * 'individual': só quem estiver em destinatarios_user_ids (sempre um
   * subconjunto de gente pertencente aos cargos escolhidos). */
  destinatarios_modo?: 'grupo' | 'individual';
  destinatarios_user_ids?: string[];
  enviar_email?: boolean;
  /** Agrupa num resumo diário (1 email/dia por pessoa) em vez de enviar
   * logo — evita repetir o incidente de 1 email por item quando um
   * backlog grande é processado de uma vez. */
  enviar_email_digest?: boolean;
}

export interface AutomationRuleConfig {
  id: string;
  acao_config: AutomationRuleAcaoConfig;
  cooldown_minutos: number;
}

/** Config completa de UMA regra (acao_config + cooldown) — só pedida quando
 * o editor abre, a estatísticas por regra não a inclui. */
export function useAutomationRuleConfig(ruleId: string | null) {
  return useQuery({
    queryKey: ['automation-rule-config', ruleId],
    queryFn: async (): Promise<AutomationRuleConfig> => {
      const { data, error } = await supabase
        .from('automation_rules')
        .select('id, acao_config, cooldown_minutos')
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

/** Cargos da organização atual — RLS já limita a query ao org do
 * utilizador autenticado (mesmo padrão de useRBAC.ts), sem filtro
 * explícito aqui. Usado para escolher diretamente que grupos recebem
 * uma automação, em vez de passar por uma permissão como proxy. */
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

/** Utilizadores pertencentes a um ou mais cargos — para o admin poder
 * escolher pessoas específicas dentro de um cargo, em vez do grupo
 * inteiro. Segue o mesmo padrão em 2 passos de UsersTab.tsx: cargo_id
 * real e por-org vive em user_organizacoes, não em profiles.cargo_id
 * (legado single-org). */
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

      const cargoPorUser = Object.fromEntries(memberships.map((m) => [m.user_id, m.cargo_id]));
      return (profiles ?? []).map((p) => ({
        id: p.id,
        nome: p.nome,
        email: p.email,
        cargo_id: cargoPorUser[p.id],
      }));
    },
    enabled: cargoIds.length > 0,
  });
}

export function useAtualizarConfigRegra() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      acaoConfig,
      cooldownMinutos,
    }: {
      id: string;
      acaoConfig: AutomationRuleAcaoConfig;
      cooldownMinutos: number;
    }) => {
      const { error } = await supabase
        .from('automation_rules')
        .update({ acao_config: acaoConfig as unknown as Json, cooldown_minutos: cooldownMinutos })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automacao-estatisticas-por-regra'] });
      queryClient.invalidateQueries({ queryKey: ['automation-rule-config', variables.id] });
    },
  });
}

/**
 * Botão "Correr agora": dispara manualmente os scans (expirações de
 * viatura/motorista, renovação de renting, cobranças atrasadas) e o
 * Rule Engine/Executor, em vez de esperar o próximo ciclo do cron.
 * Rate limit de 5 min é imposto no servidor (RPC) — este hook só reflete
 * o erro que vier de lá.
 */
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
