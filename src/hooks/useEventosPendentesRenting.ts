import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EventoPendenteRenting {
  id: string;
  titulo: string;
  cidade: string | null;
  data_inicio: string;
  matricula_devolver: string | null;
  origem_id: string;
  contrato_codigo: number | null;
  /** Quando o contrato foi criado (= "aberto"). */
  aberto_em: string | null;
  /** Nome de quem criou o contrato (lookup em profiles). */
  aberto_por: string | null;
}

interface UseOptions {
  tipo: 'entrega' | 'recolha';
  enabled?: boolean;
}

const QUERY_KEY_BASE = ['calendario', 'eventos-pendentes-renting'] as const;

/**
 * Lista eventos de renting que ainda não foram realizados, com data
 * de abertura do contrato e nome de quem o abriu.
 */
export function useEventosPendentesRenting({ tipo, enabled = true }: UseOptions) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, tipo],
    queryFn: async (): Promise<EventoPendenteRenting[]> => {
      // 1) Eventos pendentes (entrega ou recolha)
      const { data: eventos, error } = await supabase
        .from('calendario_eventos')
        .select('id, titulo, cidade, data_inicio, matricula_devolver, origem_id')
        .eq('origem_tipo', 'contrato_renting')
        .eq('tipo', tipo)
        .is('realizado_em', null)
        .order('data_inicio', { ascending: true });
      if (error) throw error;
      if (!eventos || eventos.length === 0) return [];

      // 2) Contratos referenciados — para data de abertura + autor
      const contratoIds = [...new Set(eventos.map((e) => e.origem_id).filter(Boolean) as string[])];
      let contratosMap: Record<
        string,
        { codigo: number; created_at: string; created_by: string | null }
      > = {};
      if (contratoIds.length > 0) {
        const { data: contratos } = await supabase
          .from('contratos_renting')
          .select('id, codigo, created_at, created_by')
          .in('id', contratoIds);
        if (contratos) {
          contratosMap = Object.fromEntries(
            contratos.map((c) => [
              c.id as string,
              {
                codigo: c.codigo as number,
                created_at: c.created_at as string,
                created_by: (c.created_by as string | null) ?? null,
              },
            ])
          );
        }
      }

      // 3) Nomes dos criadores
      const autorIds = [
        ...new Set(
          Object.values(contratosMap)
            .map((c) => c.created_by)
            .filter((id): id is string => !!id)
        ),
      ];
      let profilesMap: Record<string, string> = {};
      if (autorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nome')
          .in('id', autorIds);
        if (profiles) {
          profilesMap = Object.fromEntries(
            profiles.map((p) => [p.id as string, (p.nome as string) || ''])
          );
        }
      }

      return eventos.map((e) => {
        const c = contratosMap[e.origem_id as string];
        return {
          id: e.id as string,
          titulo: e.titulo as string,
          cidade: (e.cidade as string | null) ?? null,
          data_inicio: e.data_inicio as string,
          matricula_devolver: (e.matricula_devolver as string | null) ?? null,
          origem_id: e.origem_id as string,
          contrato_codigo: c?.codigo ?? null,
          aberto_em: c?.created_at ?? null,
          aberto_por: c?.created_by ? profilesMap[c.created_by] || null : null,
        };
      });
    },
    enabled,
    staleTime: 30_000,
  });
}
