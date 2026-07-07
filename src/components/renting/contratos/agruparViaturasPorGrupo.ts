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
 * Separa viaturas em "mesmo grupo da viatura actual do contrato" e "outros
 * grupos". Nunca filtra/remove — é orientação de UI, não regra de negócio
 * bloqueante. Grupo null (actual ou candidata) nunca conta como
 * correspondência.
 */
export function agruparViaturasPorGrupo(
  viaturas: ViaturaComGrupo[],
  grupoIdAtual: string | null
): AgrupamentoResultado {
  const mesmoGrupo: ViaturaComGrupo[] = [];
  const outrosGrupos: ViaturaComGrupo[] = [];

  for (const v of viaturas) {
    if (grupoIdAtual && v.grupoId === grupoIdAtual) {
      mesmoGrupo.push(v);
    } else {
      outrosGrupos.push(v);
    }
  }

  return { mesmoGrupo, outrosGrupos };
}
