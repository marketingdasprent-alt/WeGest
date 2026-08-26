// supabase/functions/_shared/resumo-semanal-viatura/diasPorMotorista.ts
//
// Reparte os dias de um período pelos contratos, com uma regra só:
// **cada dia é cobrado uma única vez à mesma pessoa.**
//
// Vivia dentro de fechar-semana-financeiro/index.ts, onde não dava para
// testar. É a contraparte, do lado do fecho, do buildSlotPeriodos do ecrã
// (src/components/administrativo/motorista-resumo/slotPeriodos.ts) — as duas
// têm de concordar, e é por isso que ambas têm testes com os mesmos casos.

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

/**
 * Um contrato pode ter várias linhas em `contratos_renting` para a mesma
 * viatura no mesmo período: versionamento (edição/renovação, `substituido_em`
 * preenchido no antigo), ou reservas placeholder que nunca avançaram. Duas
 * linhas podem ter datas IDÊNTICAS (edição administrativa sem mudar o período
 * — só a mais recente conta) ou datas DIFERENTES/adjacentes (renovação real —
 * contam as duas, cada uma pelos seus dias).
 *
 * Em vez de somar todos os contratos que se sobrepõem ao período (o que
 * duplicava no caso das datas idênticas), cada DIA é atribuído a no máximo um
 * contrato: o de maior prioridade — versão ainda não substituída primeiro,
 * depois `versao` mais alta — entre os que o cobrem. Um contrato cujos dias
 * foram todos tomados por uma versão mais recente fica de fora do resultado.
 */
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
    // Desempate estável: sem isto o resultado depende da ordem por que as
    // linhas vieram da base de dados. O padrão "último a ler ganha" já custou
    // dinheiro três vezes neste projecto.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const diasReivindicados = new Set<string>();
  const resultado = new Map<string, DiasReivindicados>();

  for (const c of ordenados) {
    // O dia em que o motorista LEVANTA o carro não é cobrado a ninguém: a
    // contagem começa no dia seguinte. Tem de ser igual ao buildSlotPeriodos
    // do ecrã, senão o resumo e o fecho voltam a divergir.
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

/**
 * O livro de dias é por PESSOA, não por viatura.
 *
 * reivindicarDiasPorContrato sozinha já dava um dia a um só contrato, mas era
 * chamada uma vez por viatura, com o livro a começar vazio de cada vez. Um
 * motorista com duas viaturas atribuídas em simultâneo era cobrado 7 + 7 dias
 * numa semana de 7. Caso real gravado no fecho de 10–16/08/2026: 500,00 +
 * 275,00 + 275,00 = 1.050,00 EUR a uma só pessoa, com os sete dias
 * sobrepostos nos três contratos.
 *
 * Contratos sem condutor identificado mantêm um livro POR VIATURA: não há
 * pessoa a quem imputar os dias, e metê-los todos num balde comum faria
 * contratos de gente diferente roubarem dias uns aos outros.
 */
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
