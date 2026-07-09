import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface GestorTvde {
  nome: string;
}

/** Gestores TVDE da org activa, via user_organizacoes (per-org) — filtra
 *  pelo nome do cargo (cargos são por-org, ids distintos entre orgs). */
export function useGestoresTvde(orgId: string | null): GestorTvde[] {
  const [gestores, setGestores] = useState<GestorTvde[]>([]);

  useEffect(() => {
    if (!orgId) return;
    const fetchGestores = async () => {
      try {
        const { data, error } = await supabase
          .from('user_organizacoes')
          .select('cargos(nome), profiles(nome)')
          .eq('org_id', orgId);

        if (error) throw error;

        const uniqueGestores = ((data as any[]) || []).reduce((acc: GestorTvde[], current) => {
          const cargoNome = (current.cargos?.nome || '').toLowerCase();
          const nome = current.profiles?.nome as string | undefined;
          const isGestorTvde = cargoNome.includes('gestor') && cargoNome.includes('tvde');
          if (isGestorTvde && nome && !acc.find((item) => item.nome === nome)) {
            acc.push({ nome });
          }
          return acc;
        }, []);
        uniqueGestores.sort((a, b) => a.nome.localeCompare(b.nome));

        setGestores(uniqueGestores);
      } catch (error) {
        console.error('Erro ao buscar gestores:', error);
      }
    };
    fetchGestores();
  }, [orgId]);

  return gestores;
}
