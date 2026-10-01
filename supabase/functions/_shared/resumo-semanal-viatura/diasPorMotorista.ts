// Cada dia é cobrado uma única vez por pessoa, como no cálculo apresentado na UI.

export interface ContratoParaRepartir {
  id: string;
  viatura_id: string;
  data_inicio: string;
  data_fim: string | null;
  versao: number | null;
  substituido_em: string | null;
}

export interface DiasReivindicados {
  inicio: string;
  fim: string;
  dias: number;
}

function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Versões ativas e mais recentes têm prioridade por dia para impedir dupla cobrança. */
export function reivindicarDiasPorContrato(
  candidatos: ContratoParaRepartir[],
  inicioPeriodo: Date,
  fimPeriodo: Date
): Map<string, DiasReivindicados> {
  const ordenados = [...candidatos].sort((a, b) => {
    const aVivo = a.substituido_em == null;
    const bVivo = b.substituido_em == null;
    if (aVivo !== bVivo) return aVivo ? -1 : 1;
    const porVersao = (b.versao ?? 0) - (a.versao ?? 0);
    if (porVersao !== 0) return porVersao;
    // O desempate estável torna o resultado independente da ordem da base.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const diasReivindicados = new Set<string>();
  const resultado = new Map<string, DiasReivindicados>();

  for (const c of ordenados) {
    // A recolha não é cobrada; a contagem começa no dia seguinte.
    const cInicio = new Date(`${c.data_inicio.split('T')[0]}T00:00:00Z`);
    cInicio.setUTCDate(cInicio.getUTCDate() + 1);
    const cFim = c.data_fim ? new Date(`${c.data_fim.split('T')[0]}T00:00:00Z`) : fimPeriodo;
    const overlapInicio = cInicio > inicioPeriodo ? cInicio : inicioPeriodo;
    const overlapFim = cFim < fimPeriodo ? cFim : fimPeriodo;
    if (overlapInicio > overlapFim) continue;

    const diasLivres: string[] = [];
    for (
      let d = new Date(overlapInicio);
      d.getTime() <= overlapFim.getTime();
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const iso = toIsoDate(d);
      if (!diasReivindicados.has(iso)) {
        diasLivres.push(iso);
        diasReivindicados.add(iso);
      }
    }
    if (diasLivres.length > 0) {
      diasLivres.sort();
      resultado.set(c.id, {
        inicio: diasLivres[0],
        fim: diasLivres[diasLivres.length - 1],
        dias: diasLivres.length,
      });
    }
  }

  return resultado;
}

/** Agrupa por motorista; sem motorista, mantém livros separados por viatura. */
export function repartirDiasPorMotorista(
  contratos: ContratoParaRepartir[],
  motoristaDoContrato: (contratoId: string) => string | null,
  inicioPeriodo: Date,
  fimPeriodo: Date
): Map<string, DiasReivindicados> {
  const porLivro = new Map<string, ContratoParaRepartir[]>();

  for (const c of contratos) {
    const motoristaId = motoristaDoContrato(c.id);
    const livro = motoristaId ? `mot:${motoristaId}` : `via:${c.viatura_id}`;
    const lista = porLivro.get(livro) ?? [];
    lista.push(c);
    porLivro.set(livro, lista);
  }

  const claims = new Map<string, DiasReivindicados>();
  for (const contratosDoLivro of porLivro.values()) {
    for (const [contratoId, claim] of reivindicarDiasPorContrato(
      contratosDoLivro,
      inicioPeriodo,
      fimPeriodo
    )) {
      claims.set(contratoId, claim);
    }
  }
  return claims;
}
