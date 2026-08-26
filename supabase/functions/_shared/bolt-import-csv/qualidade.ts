// supabase/functions/_shared/bolt-import-csv/qualidade.ts
//
// Piso relativo da importação semanal da Bolt: compara o que acabou de entrar
// com a mediana das semanas anteriores da MESMA integração (mesmo integracao_id).
//
// Serve para apanhar o caso de 2026-07-20: o robô correu, devolveu 'completed'
// e trouxe 8 linhas em vez das ~205 habituais. O cabeçalho estava bom, os
// números estavam bons — só faltavam 197 motoristas, e ninguém deu por isso.
//
// Mediana (e não média) porque uma única semana anómala no histórico não pode
// arrastar o piso consigo.

/** Quantas semanas anteriores entram na comparação. */
export const SEMANAS_HISTORICO = 4;

/**
 * Mínimo de semanas com dados para o piso fazer sentido. Numa integração nova
 * (0 ou 1 semanas) não se avisa — não há do que se avisar.
 */
export const MIN_SEMANAS_HISTORICO = 2;

/** Abaixo de 50% da mediana de linhas → aviso. */
export const LIMIAR_LINHAS = 0.5;

/** Abaixo de 60% da mediana do bruto → aviso. */
export const LIMIAR_BRUTO = 0.6;

export interface SemanaHistorico {
  periodo: string;
  linhas: number;
  bruto: number;
}

/** Uma linha de bolt_resumos_semanais, reduzida ao que interessa ao piso. */
export interface LinhaHistorico {
  periodo: string;
  periodo_inicio?: string | null;
  ganhos_brutos_total?: number | string | null;
}

export interface AvaliacaoPiso {
  avisar: boolean;
  mensagem: string | null;
  medianaLinhas: number;
  medianaBruto: number;
  semanasComparadas: string[];
}

export function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

/** 48230.1 → "48.230,10 EUR" (sem depender do Intl/locale do runtime). */
export function formatarEuros(valor: number): string {
  const [inteiro, decimal] = Math.abs(valor).toFixed(2).split('.');
  const comMilhares = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${valor < 0 ? '-' : ''}${comMilhares},${decimal} EUR`;
}

function formatarQuantidade(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace('.', ',');
}

/**
 * Agrupa as linhas históricas por período e devolve as N semanas mais recentes,
 * da mais recente para a mais antiga. O período que está a ser importado é
 * excluído (numa reimportação as suas linhas já estão na tabela e falseariam a
 * comparação consigo próprias).
 */
export function agruparSemanas(
  linhas: LinhaHistorico[],
  periodoAtual: string,
  limite = SEMANAS_HISTORICO,
): SemanaHistorico[] {
  const porPeriodo = new Map<string, { linhas: number; bruto: number; inicio: string }>();

  for (const linha of linhas || []) {
    if (!linha?.periodo || linha.periodo === periodoAtual) continue;
    const acumulado = porPeriodo.get(linha.periodo) ?? { linhas: 0, bruto: 0, inicio: '' };
    acumulado.linhas += 1;
    acumulado.bruto += Number(linha.ganhos_brutos_total ?? 0) || 0;
    if (!acumulado.inicio && linha.periodo_inicio) acumulado.inicio = linha.periodo_inicio;
    porPeriodo.set(linha.periodo, acumulado);
  }

  return [...porPeriodo.entries()]
    .map(([periodo, v]) => ({ periodo, linhas: v.linhas, bruto: v.bruto, inicio: v.inicio || periodo }))
    .sort((a, b) => b.inicio.localeCompare(a.inicio))
    .slice(0, limite)
    .map(({ periodo, linhas, bruto }) => ({ periodo, linhas, bruto }));
}

/**
 * Compara a importação com o histórico. Quando fica abaixo do piso devolve
 * `avisar: true` e uma mensagem que diz sempre os dois números (linhas e bruto),
 * mesmo que só um deles tenha disparado — quem lê o log precisa dos dois para
 * perceber se foi o ficheiro que veio curto ou se a frota encolheu.
 */
export function avaliarPisoRelativo(
  linhasImportadas: number,
  brutoImportado: number,
  historico: SemanaHistorico[],
): AvaliacaoPiso {
  const semanas = historico || [];
  const semanasComparadas = semanas.map((s) => s.periodo);

  if (semanas.length < MIN_SEMANAS_HISTORICO) {
    // Integração sem histórico suficiente: não há piso, não se avisa.
    return { avisar: false, mensagem: null, medianaLinhas: 0, medianaBruto: 0, semanasComparadas };
  }

  const medianaLinhas = mediana(semanas.map((s) => s.linhas));
  const medianaBruto = mediana(semanas.map((s) => s.bruto));

  const pisoLinhas = medianaLinhas * LIMIAR_LINHAS;
  const pisoBruto = medianaBruto * LIMIAR_BRUTO;

  const linhasAbaixo = medianaLinhas > 0 && linhasImportadas < pisoLinhas;
  const brutoAbaixo = medianaBruto > 0 && brutoImportado < pisoBruto;

  if (!linhasAbaixo && !brutoAbaixo) {
    return { avisar: false, mensagem: null, medianaLinhas, medianaBruto, semanasComparadas };
  }

  const mensagem =
    `Importação abaixo do piso das ${semanas.length} semanas anteriores: ` +
    `${linhasImportadas} linhas (mediana ${formatarQuantidade(medianaLinhas)}, ` +
    `piso ${formatarQuantidade(pisoLinhas)}) e ${formatarEuros(brutoImportado)} de ganhos ` +
    `brutos (mediana ${formatarEuros(medianaBruto)}, piso ${formatarEuros(pisoBruto)}). ` +
    `Os dados foram gravados na mesma — confirmar o ficheiro antes de fechar a semana.`;

  return { avisar: true, mensagem, medianaLinhas, medianaBruto, semanasComparadas };
}
