export interface MovimentoParaResumo {
  tipo: string;
  valor: number | string;
  status: string;
}

export interface ResumoMovimentos {
  creditos: number;
  debitos: number;
  acumuladoCreditos: number;
  acumuladoDebitos: number;
}

export function calcularResumoMovimentos(
  movimentos: readonly MovimentoParaResumo[]
): ResumoMovimentos {
  const resumo: ResumoMovimentos = {
    creditos: 0,
    debitos: 0,
    acumuladoCreditos: 0,
    acumuladoDebitos: 0,
  };

  for (const movimento of movimentos) {
    if (movimento.status === 'cancelado') continue;

    const valor = Number(movimento.valor);
    if (!Number.isFinite(valor)) continue;

    const pendente = movimento.status === 'pendente';

    if (movimento.tipo === 'credito') {
      resumo.acumuladoCreditos += valor;
      if (pendente) resumo.creditos += valor;
    } else {
      resumo.acumuladoDebitos += valor;
      if (pendente) resumo.debitos += valor;
    }
  }

  return resumo;
}
