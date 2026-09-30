import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { QUERY_KEY_CAPAS, assinarCaminhos, dbSemTipos } from '@/hooks/useFotosViatura';

interface LinhaCapa {
  viatura_id: string;
  ficheiro_url: string;
  miniatura_url: string | null;
}

/** viaturaId → caminho da imagem a mostrar na lista (a miniatura, se houver). */
export function caminhoDaCapa(linhas: LinhaCapa[]): Map<string, string> {
  return new Map(linhas.map((l) => [l.viatura_id, l.miniatura_url || l.ficheiro_url]));
}

/**
 * Miniatura da capa de cada viatura visível na lista.
 *
 * Nunca parte a lista: sem fotos, sem a migração aplicada ou com erro, devolve
 * um mapa vazio e cada linha mostra o ícone por omissão. Só se assinam as URLs
 * das viaturas da página, não das 466.
 */
export function useCapasViaturas(viaturaIdsVisiveis: string[]): Map<string, string> {
  const capas = useQuery({
    queryKey: [QUERY_KEY_CAPAS],
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await dbSemTipos
        .from('viatura_capas')
        .select('viatura_id, ficheiro_url, miniatura_url');
      if (error) throw error;
      return caminhoDaCapa((data ?? []) as LinhaCapa[]);
    },
  });

  const caminhos = useMemo(
    () =>
      viaturaIdsVisiveis
        .map((id) => capas.data?.get(id))
        .filter((p): p is string => !!p)
        .sort(),
    [viaturaIdsVisiveis, capas.data]
  );

  const urls = useQuery({
    queryKey: [QUERY_KEY_CAPAS, 'urls', caminhos],
    enabled: caminhos.length > 0,
    staleTime: 50 * 60 * 1000,
    retry: false,
    queryFn: () => assinarCaminhos(caminhos),
  });

  return useMemo(() => {
    const porViatura = new Map<string, string>();
    for (const id of viaturaIdsVisiveis) {
      const caminho = capas.data?.get(id);
      const url = caminho ? urls.data?.get(caminho) : undefined;
      if (url) porViatura.set(id, url);
    }
    return porViatura;
  }, [viaturaIdsVisiveis, capas.data, urls.data]);
}
