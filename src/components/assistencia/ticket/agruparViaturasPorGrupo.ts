export interface ViaturaComGrupo {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  grupoId: string | null;
  grupoNome: string | null;
}

interface AgrupamentoResultado {
  mesmoGrupo: ViaturaComGrupo[];
  outrosGrupos: ViaturaComGrupo[];
}

/**
 * Separa viaturas disponíveis em "mesmo grupo da avariada" e "outros grupos".
 * Nunca filtra/remove — é orientação de UI, não regra de negócio bloqueante.
 * Grupo null (avariada ou candidata) nunca conta como correspondência.
 */
export function agruparViaturasPorGrupo(
  viaturas: ViaturaComGrupo[],
  grupoIdAvariada: string | null
): AgrupamentoResultado {
  const mesmoGrupo: ViaturaComGrupo[] = [];
  const outrosGrupos: ViaturaComGrupo[] = [];

  for (const v of viaturas) {
    if (grupoIdAvariada && v.grupoId === grupoIdAvariada) {
      mesmoGrupo.push(v);
    } else {
      outrosGrupos.push(v);
    }
  }

  return { mesmoGrupo, outrosGrupos };
}
