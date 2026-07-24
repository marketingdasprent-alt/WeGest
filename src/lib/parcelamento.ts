/**
 * Geração do plano de parcelas de um acordo de pagamento.
 *
 * Lógica PURA e sem I/O de propósito: é consumida pelo diálogo de parcelamento
 * (pré-visualização em tempo real) e pelo payload enviado à RPC `acordo_criar`.
 * Ter uma só implementação evita que o que o utilizador vê no ecrã divirja do
 * que fica gravado.
 *
 * A base de dados valida na mesma que a soma bate certo — isto é conveniência,
 * não é a fonte de verdade.
 */

export type FrequenciaParcela = 'semanal' | 'mensal' | 'personalizado';

export interface ParcelaPlano {
  /** 0 = entrada; 1..N = parcelas. */
  numero: number;
  /** ISO `YYYY-MM-DD`. */
  data_vencimento: string;
  valor: number;
}

export interface GerarPlanoInput {
  /** Saldo a parcelar (já descontado do que estiver liquidado). */
  valorTotal: number;
  numParcelas: number;
  frequencia: FrequenciaParcela;
  /** ISO `YYYY-MM-DD`. Âncora do cálculo das datas. */
  dataInicio: string;
  /** Dia do mês (1–31) para frequência mensal. */
  diaVencimento?: number;
  entrada?: { valor: number; data: string };
}

/** Mesma tolerância de cêntimo usada em `estadoCobranca.ts`. */
const EPS = 0.005;

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;

/** Datas tratadas em UTC de propósito: evita que o fuso desloque um vencimento um dia. */
const parseISO = (s: string) => new Date(`${s}T00:00:00Z`);

/**
 * Avança `meses` a partir da âncora, fixando o dia em `dia`.
 * Encolhe para o último dia do mês quando o mês é curto — sem isto,
 * "dia 31" transbordaria de fevereiro para março.
 */
function addMesesComDia(ancora: Date, meses: number, dia: number): Date {
  const ano = ancora.getUTCFullYear();
  const mes = ancora.getUTCMonth() + meses;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDia)));
}

export function somaParcelas(parcelas: ParcelaPlano[]): number {
  return round2(parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0));
}

export function planoBateCerto(parcelas: ParcelaPlano[], valorTotal: number): boolean {
  return Math.abs(somaParcelas(parcelas) - round2(valorTotal)) < EPS;
}

export function gerarPlanoParcelas(input: GerarPlanoInput): ParcelaPlano[] {
  const { valorTotal, numParcelas, frequencia, dataInicio, diaVencimento, entrada } = input;

  if (!Number.isInteger(numParcelas) || numParcelas < 1) {
    throw new Error('O número de parcelas tem de ser pelo menos 1.');
  }
  const total = round2(valorTotal);
  if (total <= 0) throw new Error('O valor a parcelar tem de ser positivo.');

  const valorEntrada = entrada ? round2(entrada.valor) : 0;
  if (entrada && valorEntrada <= 0) {
    throw new Error('O valor da entrada tem de ser positivo.');
  }
  if (entrada && valorEntrada >= total - EPS) {
    throw new Error('A entrada tem de ser inferior ao valor a parcelar.');
  }

  const ancora = parseISO(dataInicio);
  const restante = round2(total - valorEntrada);

  // Divide por igual e empurra o resto de arredondamento para a última parcela,
  // para que a soma feche SEMPRE ao cêntimo com o total.
  const base = Math.floor((restante * 100) / numParcelas) / 100;
  const valores = Array.from({ length: numParcelas }, () => base);
  valores[numParcelas - 1] = round2(restante - base * (numParcelas - 1));

  const dia = diaVencimento ?? ancora.getUTCDate();
  const diaAtual = ancora.getUTCDate();
  let offset = 1;
  if (diaVencimento !== undefined && diaVencimento > diaAtual) {
    offset = 0;
  }

  const parcelas: ParcelaPlano[] = valores.map((valor, i) => ({
    numero: i + 1,
    data_vencimento:
      frequencia === 'semanal'
        ? iso(new Date(ancora.getTime() + (i + 1) * 7 * 86400000))
        : iso(addMesesComDia(ancora, offset + i, dia)),
    valor,
  }));

  if (entrada) {
    parcelas.unshift({ numero: 0, data_vencimento: entrada.data, valor: valorEntrada });
  }
  return parcelas;
}
