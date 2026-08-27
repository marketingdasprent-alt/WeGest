import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AssistenteGrupo {
  cargoId: string;
  cargoNome: string;
  membros: { id: string; nome: string }[];
}

interface AssistenteRow {
  cargo_id: string;
  cargo_nome: string;
  user_id: string;
  nome: string;
}

/**
 * Lista os candidatos a "assistente responsável", agrupados por grupo (cargo):
 * todos os membros dos grupos marcados como "Disponível para assistência" nas
 * permissões da organização ativa.
 *
 * Os dados vêm da RPC `get_assistentes_disponiveis` (SECURITY DEFINER), porque
 * a RLS de user_organizacoes/profiles não deixa um gestor não-admin listar os
 * colegas. A RPC já filtra por org ativa e por quem gere assistência.
 */
export function useAssistentesDisponiveis(enabled = true) {
  return useQuery({
    queryKey: ['assistentes-disponiveis'],
    enabled,
    queryFn: async (): Promise<AssistenteGrupo[]> => {
      const { data, error } = await supabase.rpc('get_assistentes_disponiveis');
      if (error) throw error;

      const rows = (data || []) as AssistenteRow[];
      const byCargo = new Map<string, AssistenteGrupo>();
      for (const r of rows) {
        let grupo = byCargo.get(r.cargo_id);
        if (!grupo) {
          grupo = { cargoId: r.cargo_id, cargoNome: r.cargo_nome, membros: [] };
          byCargo.set(r.cargo_id, grupo);
        }
        if (!grupo.membros.some((m) => m.id === r.user_id)) {
          grupo.membros.push({ id: r.user_id, nome: r.nome });
        }
      }
      return [...byCargo.values()];
    },
  });
}
