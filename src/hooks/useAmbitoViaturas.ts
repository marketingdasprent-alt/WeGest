import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import {
  ambitoDoUtilizador,
  chaveMatricula,
  viaturaNoAmbito,
  type AmbitoViaturas,
} from '@/utils/ambitoViaturas';

/** Conjunto vazio estável, para quando o âmbito ainda está a carregar. */
export const SEM_VIATURAS: ReadonlySet<string> = new Set();

/** Parâmetro no URL para "Ver toda a frota" — partilhável e por página. */
export const PARAM_FROTA_TODA = 'frota';

interface ViaturaTipoMin {
  id: string;
  matricula: string | null;
  is_slot: boolean | null;
  viatura_tipos: { nome: string | null } | null;
}

export interface UseAmbitoViaturas {
  ambito: AmbitoViaturas | null;
  /** Há âmbito e o utilizador não pediu a frota toda. */
  activo: boolean;
  verTudo: boolean;
  setVerTudo: (v: boolean) => void;
}

/** Âmbito do utilizador e o interruptor "Ver toda a frota" (no URL). */
export function useAmbitoViaturas(): UseAmbitoViaturas {
  const { isAdmin, cargo, loading } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const ambito = useMemo(
    () => (loading ? null : ambitoDoUtilizador({ isAdmin, cargo })),
    [isAdmin, cargo, loading]
  );
  const verTudo = searchParams.get(PARAM_FROTA_TODA) === 'toda';

  const setVerTudo = useCallback(
    (v: boolean) =>
      setSearchParams(
        (anterior) => {
          const proximo = new URLSearchParams(anterior);
          if (v) proximo.set(PARAM_FROTA_TODA, 'toda');
          else proximo.delete(PARAM_FROTA_TODA);
          return proximo;
        },
        { replace: true }
      ),
    [setSearchParams]
  );

  return { ambito, activo: !!ambito && !verTudo, verTudo, setVerTudo };
}

/**
 * Viaturas do âmbito, por id e por matrícula — para páginas que não carregam
 * a frota (contratos, reservas, calendário). Só consulta quando há âmbito activo.
 */
export function useViaturasDoAmbito(ambito: AmbitoViaturas | null, activo: boolean) {
  return useQuery({
    queryKey: ['viaturas-ambito', ambito?.nome ?? null],
    enabled: activo && !!ambito,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viaturas')
        .select('id, matricula, is_slot, viatura_tipos(nome)');
      if (error) throw error;
      const ids = new Set<string>();
      const matriculas = new Set<string>();
      for (const v of (data ?? []) as unknown as ViaturaTipoMin[]) {
        if (!viaturaNoAmbito({ isSlot: v.is_slot, tipoNome: v.viatura_tipos?.nome }, ambito)) {
          continue;
        }
        ids.add(v.id);
        const chave = chaveMatricula(v.matricula);
        if (chave) matriculas.add(chave);
      }
      return { ids, matriculas };
    },
  });
}
