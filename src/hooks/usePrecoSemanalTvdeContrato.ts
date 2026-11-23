import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { ehRegimeTvde, precoSemanalTvde, precoSemanaNegociadoTvde } from '@shared/precoAluguer';
import type { PrecoSemanalTvde } from '@shared/precoAluguer';

interface UsePrecoSemanalTvdeContratoInput {
  regime: string | null | undefined;
  precoSemanaAcordado: number | null | undefined;
  tarifaId: string | null | undefined;
  viaturaId: string | null | undefined;
}

export interface PrecoSemanalTvdeEstado {
  /** `undefined` enquanto carrega ou quando a leitura da tarifa falhou. */
  preco: PrecoSemanalTvde | undefined;
  carregando: boolean;
  erro: boolean;
}

interface TabelaPrecos {
  precoTarifa: number | null;
  precoTarifaModelo: number | null;
}

/**
 * Preço semanal que o fecho cobra a um contrato TVDE (acordado, senão tarifa).
 * Vai à BD por tarifa/viatura porque as listas do formulário só trazem tarifas
 * activas. Só falhar a ler a tarifa é erro: sem viatura ou sem preço do modelo
 * o preço do modelo é null e o da tarifa mantém-se.
 */
export function usePrecoSemanalTvdeContrato({
  regime,
  precoSemanaAcordado,
  tarifaId,
  viaturaId,
}: UsePrecoSemanalTvdeContratoInput): PrecoSemanalTvdeEstado {
  const acordado = precoSemanaNegociadoTvde(regime, precoSemanaAcordado);
  const precisaTabela = ehRegimeTvde(regime) && acordado == null && !!tarifaId;

  const { data, isError, isPending } = useQuery({
    queryKey: ['preco-semanal-tvde', { tarifaId: tarifaId ?? null, viaturaId: viaturaId ?? null }],
    enabled: precisaTabela,
    queryFn: async (): Promise<TabelaPrecos> => {
      const [tarifa, viatura] = await Promise.all([
        supabase
          .from('renting_tarifas')
          .select('preco_semana')
          .eq('id', tarifaId as string)
          .maybeSingle(),
        viaturaId
          ? supabase.from('viaturas').select('modelo_id').eq('id', viaturaId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (tarifa.error) throw tarifa.error;

      const modeloId = viatura.error ? null : (viatura.data?.modelo_id ?? null);
      let precoTarifaModelo: number | null = null;
      if (modeloId) {
        const { data: linha, error } = await supabase
          .from('renting_tarifa_precos_modelo')
          .select('preco_semana')
          .eq('tarifa_id', tarifaId as string)
          .eq('modelo_id', modeloId)
          .maybeSingle();
        precoTarifaModelo = error ? null : (linha?.preco_semana ?? null);
      }
      return { precoTarifa: tarifa.data?.preco_semana ?? null, precoTarifaModelo };
    },
  });

  if (!ehRegimeTvde(regime) || acordado != null) {
    return {
      preco: precoSemanalTvde({ regime, precoSemanaAcordado }),
      carregando: false,
      erro: false,
    };
  }
  if (!tarifaId) {
    return { preco: { valor: null, origem: 'sem-preco' }, carregando: false, erro: false };
  }
  if (isError) return { preco: undefined, carregando: false, erro: true };
  if (isPending || !data) return { preco: undefined, carregando: true, erro: false };
  return { preco: precoSemanalTvde({ regime, ...data }), carregando: false, erro: false };
}
