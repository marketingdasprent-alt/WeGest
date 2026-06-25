import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ViaturaCandidata {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  ano: number | null;
  status: string;
  grupo_id: string | null;
  /** Nome do grupo atual da viatura (null se sem grupo) — usado no aviso de mudança. */
  grupo_nome: string | null;
}

/**
 * Viaturas da org elegíveis para associar a um grupo: todas exceto vendidas.
 * As que já pertencem a `grupoId` são excluídas (já constam na lista de
 * associadas). RLS limita o resultado à org do utilizador.
 */
export function useViaturasCandidatas(grupoId: string | undefined) {
  return useQuery({
    queryKey: ['viaturas_candidatas', grupoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viaturas')
        .select('id, matricula, marca, modelo, ano, status, grupo_id, is_vendida, renting_grupos(nome)')
        .eq('is_vendida', false)
        .order('matricula');
      if (error) throw error;
      return (data ?? [])
        .filter((v: any) => v.grupo_id !== grupoId)
        .map((v: any) => ({
          id: v.id,
          matricula: v.matricula,
          marca: v.marca,
          modelo: v.modelo,
          ano: v.ano,
          status: v.status,
          grupo_id: v.grupo_id,
          grupo_nome: v.renting_grupos?.nome ?? null,
        })) as ViaturaCandidata[];
    },
    enabled: !!grupoId,
  });
}
