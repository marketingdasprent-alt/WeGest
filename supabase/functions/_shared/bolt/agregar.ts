/**
 * Agregação das viagens da API da Bolt (getFleetOrders) em linhas semanais.
 *
 * Lógica PURA: recebe FleetOrder[] e devolve uma linha por motorista, pronta a
 * ir para bolt_resumo_merge_api. Não conhece Supabase, nem rede, nem datas —
 * para poder ser testada com um fixture e sem permissões.
 *
 * DUAS COISAS QUE NÃO SE PODEM PERDER AQUI:
 *
 * 1. As NOVE parcelas de OrderPriceData são somadas SEPARADAMENTE e devolvidas
 *    em bruto. Ainda não está provado se ride_price já engloba booking_fee e
 *    toll_fee; guardar só o derivado significaria voltar a chamar a API para
 *    responder a essa pergunta. Por isso `parcelas` sai sempre completo e as
 *    quatro variantes da fórmula são calculadas todas na mesma passagem
 *    (`variantes`) — uma corrida chega para saber qual bate certo com a semana
 *    de referência.
 *
 * 2. Dinheiro e app são baldes SEPARADOS. A identidade do bruto total é
 *      app + dinheiro + gorjetas + cancelamentos + campanha + reembolsos,
 *    portanto uma corrida paga em dinheiro que entrasse nos dois baldes era
 *    dinheiro contado duas vezes. Nesta frota o balde do dinheiro está a zero,
 *    mas isso é um facto de hoje, não uma regra.
 *
 * Somas em CÊNTIMOS inteiros: 4000+ viagens de floats acumulam resíduo e o
 * resíduo desta identidade tem de ser 0,00 EUR.
 */

import type { FleetOrder, OrderPriceData } from "./client.ts";
import { construirChaveMotorista, normalizeStr } from "../bolt-import-csv/parse.ts";

// ---------------------------------------------------------------------------
// Fórmula do bruto "pagamentos na app"
// ---------------------------------------------------------------------------

export type FormulaId = "V1" | "V2" | "V3" | "V4";

/** Descrição de cada variante, para ir no log e na resposta da edge function. */
export const FORMULAS: Readonly<Record<FormulaId, string>> = {
  V1: "Σ ride_price",
  V2: "Σ ride_price + Σ booking_fee + Σ toll_fee",
  V3: "Σ ride_price + Σ in_app_discount",
  V4: "Σ ride_price + Σ booking_fee + Σ toll_fee + Σ in_app_discount",
};

export const FORMULAS_ID = Object.keys(FORMULAS) as FormulaId[];

/** V1 até se provar o contrário contra a semana de referência (2026-07-06). */
export const FORMULA_POR_DEFEITO: FormulaId = "V1";

export function eFormulaId(valor: unknown): valor is FormulaId {
  return typeof valor === "string" && (FORMULAS_ID as string[]).includes(valor);
}

// ---------------------------------------------------------------------------
// Parcelas
// ---------------------------------------------------------------------------

/** As nove parcelas de OrderPriceData, na ordem da spec. */
export const CHAVES_PARCELAS = [
  "ride_price",
  "booking_fee",
  "toll_fee",
  "cancellation_fee",
  "tip",
  "net_earnings",
  "cash_discount",
  "in_app_discount",
  "commission",
] as const;

export type ChaveParcela = typeof CHAVES_PARCELAS[number];

export type ParcelasBolt = Record<ChaveParcela, number>;

/** Acumulador interno em cêntimos inteiros. */
type Centimos = Record<ChaveParcela, number>;

function novoAcumulador(): Centimos {
  const zero = {} as Centimos;
  for (const chave of CHAVES_PARCELAS) zero[chave] = 0;
  return zero;
}

function numero(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function paraCentimos(valor: unknown): number {
  return Math.round(numero(valor) * 100);
}

function acumular(destino: Centimos, preco: OrderPriceData | undefined): void {
  if (!preco) return;
  // O tipo diz number, a API já mandou strings e nulls — paraCentimos trata
  // disso; o que interessa aqui é percorrer as nove chaves e não falhar uma.
  for (const chave of CHAVES_PARCELAS) destino[chave] += paraCentimos(preco[chave]);
}

function somarAcumulador(destino: Centimos, origem: Centimos): void {
  for (const chave of CHAVES_PARCELAS) destino[chave] += origem[chave];
}

function paraEuros(centimos: Centimos): ParcelasBolt {
  const euros = {} as ParcelasBolt;
  for (const chave of CHAVES_PARCELAS) euros[chave] = centimos[chave] / 100;
  return euros;
}

/** Fórmula aplicada em cêntimos — sem resíduo de vírgula flutuante. */
function formulaCentimos(c: Centimos, formulaId: FormulaId): number {
  switch (formulaId) {
    case "V2":
      return c.ride_price + c.booking_fee + c.toll_fee;
    case "V3":
      return c.ride_price + c.in_app_discount;
    case "V4":
      return c.ride_price + c.booking_fee + c.toll_fee + c.in_app_discount;
    case "V1":
    default:
      return c.ride_price;
  }
}

/** Versão pública da fórmula, sobre parcelas já em euros. */
export function aplicarFormula(parcelas: ParcelasBolt, formulaId: FormulaId): number {
  const centimos = novoAcumulador();
  for (const chave of CHAVES_PARCELAS) centimos[chave] = paraCentimos(parcelas[chave]);
  return formulaCentimos(centimos, formulaId) / 100;
}

// ---------------------------------------------------------------------------
// Classificação das ordens
// ---------------------------------------------------------------------------

/**
 * A Bolt não documenta a lista de payment_method. Reconhecem-se as variantes
 * conhecidas de numerário ('cash', 'cash_in_car', 'dinheiro'); tudo o resto
 * conta como pagamento na app.
 *
 * normalizeStr troca '_' e '-' por espaço, por isso 'cash_in_car' vira
 * 'cash in car'. 'cashless' NÃO é apanhado (a fronteira \b protege).
 */
export function ePagamentoEmDinheiro(metodo?: string | null): boolean {
  if (!metodo) return false;
  return /\b(cash|dinheiro|numerario)\b/.test(normalizeStr(metodo));
}

/** Só 'finished' conta como viagem terminada — igual à coluna do CSV. */
export function eOrdemTerminada(estado?: string | null): boolean {
  return (estado ?? "").trim().toLowerCase() === "finished";
}

/**
 * A corrida rende dinheiro ao motorista?
 *
 * A REGRA: quando a falha é do motorista, ele não recebe. Os estados da Bolt
 * dizem de quem foi a falha no próprio nome:
 *
 *   driver_did_not_respond          não atendeu       → não recebe
 *   driver_rejected                 recusou           → não recebe
 *   driver_cancelled_after_accept   aceitou e desistiu → não recebe
 *
 *   client_cancelled                o cliente desistiu → RECEBE
 *   client_did_not_show             o cliente faltou   → RECEBE
 *   finished                        fez a corrida      → RECEBE
 *
 * Nos dois casos do cliente a Bolt cobra-lhe a taxa de cancelamento e entrega-a
 * ao motorista menos a comissão — em produção são 7.728,42 EUR que são mesmo
 * dele e não podem desaparecer. Nos três do motorista sobram 89,15 EUR, que
 * ele nunca vai receber e não deviam estar somados.
 *
 * O prefixo `driver_` é usado de propósito em vez de uma lista fechada: se a
 * Bolt acrescentar amanhã um `driver_cancelled_before_accept`, a regra apanha-o
 * sozinha. Um estado novo que não seja culpa do motorista continua a pagar —
 * melhor mostrar dinheiro a mais e dar por isso do que escondê-lo em silêncio.
 */
export function eOrdemPaga(estado?: string | null): boolean {
  const e = (estado ?? "").trim().toLowerCase();
  if (e === "finished") return true;
  return !e.startsWith("driver_");
}

// ---------------------------------------------------------------------------
// Uma corrida, várias tentativas
// ---------------------------------------------------------------------------

/**
 * O getFleetOrders devolve uma linha por TENTATIVA, não por corrida.
 *
 * Quando um motorista não responde, rejeita, ou aceita e cancela, a Bolt volta
 * a despachar a mesma corrida — e devolve uma linha por cada uma dessas
 * tentativas, TODAS com os mesmos valores de dinheiro. Somar as linhas conta o
 * mesmo dinheiro várias vezes.
 *
 * O `order_reference` é base64 de `<frota>-<corrida>-<tentativa>` (verificado
 * nas 818.927 linhas em produção: todas com exactamente 3 segmentos). Os dois
 * primeiros identificam a CORRIDA; o terceiro é a tentativa.
 *
 * Devolve `<frota>-<corrida>`; se a referência não tiver esta forma, devolve-a
 * intacta — assim uma referência que não se reconheça continua a ser a sua
 * própria chave e nunca se funde com outra por engano.
 */
export function chaveDaCorrida(referencia?: string | null): string | null {
  const ref = texto(referencia);
  if (!ref) return null;

  let legivel: string;
  try {
    // base64url → base64, e a almofada que a Bolt não manda.
    const normalizada = ref.replace(/-/g, "+").replace(/_/g, "/");
    legivel = atob(normalizada + "=".repeat((4 - (normalizada.length % 4)) % 4));
  } catch {
    return ref;
  }

  // Exigir a forma conhecida. Sem isto, uma referência que descodifique para
  // lixo podia colidir com outra e fundir duas corridas diferentes.
  const partes = /^(\d+)-(\d+)-(\d+)$/.exec(legivel);
  return partes ? `${partes[1]}-${partes[2]}` : ref;
}

/**
 * Uma linha por corrida: fica a tentativa que interessa.
 *
 * A concluída manda — está verificado em produção que NENHUMA corrida tem duas
 * tentativas 'finished', portanto não há ambiguidade. Sem nenhuma concluída,
 * fica a primeira: as tentativas trazem valores idênticos, por isso qualquer
 * uma serve, e a primeira mantém a saída estável.
 *
 * Escolher a concluída também arruma a atribuição: em 7.283 corridas a Bolt
 * mudou de motorista a meio, e quem rejeitou ficava com uma cópia do dinheiro
 * de quem a fez.
 */
/**
 * Qual das tentativas da mesma corrida vale mais como retrato dela.
 *
 *   2 · concluída       — houve corrida e houve pagamento; há no máximo uma.
 *   1 · pagável         — não concluiu, mas a falha foi do cliente e a taxa de
 *                         cancelamento é do motorista.
 *   0 · culpa do motorista — não atendeu, recusou, desistiu. Não rende nada.
 *
 * O degrau do meio existe por causa de 98 corridas em produção: o motorista
 * não atendeu à primeira, o cliente cancelou à segunda, e a taxa ficava
 * agarrada à segunda tentativa. Ficar simplesmente com a primeira deitava
 * fora 314,83 EUR que são dos motoristas.
 */
function prioridadeDaTentativa(ordem: FleetOrder | undefined): number {
  if (eOrdemTerminada(ordem?.order_status)) return 2;
  return eOrdemPaga(ordem?.order_status) ? 1 : 0;
}

export function umaLinhaPorCorrida(ordens: readonly FleetOrder[]): FleetOrder[] {
  const porCorrida = new Map<string, FleetOrder>();
  const semChave: FleetOrder[] = [];

  for (const ordem of ordens) {
    const chave = chaveDaCorrida(ordem?.order_reference);
    if (!chave) {
      semChave.push(ordem);
      continue;
    }
    const jaLa = porCorrida.get(chave);
    if (!jaLa) {
      porCorrida.set(chave, ordem);
      continue;
    }
    if (prioridadeDaTentativa(ordem) > prioridadeDaTentativa(jaLa)) {
      porCorrida.set(chave, ordem);
    }
  }

  return [...porCorrida.values(), ...semChave];
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export interface LinhaAgregada {
  /** COALESCE(driver_uuid, nome normalizado) — o mesmo critério do CSV. */
  chave: string;
  /** Vai para p_identificador_motorista. NULL quando a Bolt não mandou uuid. */
  driver_uuid: string | null;
  driver_name: string | null;
  driver_phone: string | null;

  orders_total: number;
  orders_finished: number;
  orders_cash: number;

  /** Todas as ordens (app + dinheiro). É isto que vai para as colunas api_*. */
  parcelas: ParcelasBolt;
  /** Só as ordens pagas na app. */
  parcelas_app: ParcelasBolt;
  /** Só as ordens pagas em dinheiro. */
  parcelas_dinheiro: ParcelasBolt;

  /** Σ ride_distance sem conversão nenhuma (unidade da Bolt, não confirmada). */
  ride_distance: number;
  distancia_total_km: number;
  distancia_media_km: number;

  // Colunas de bolt_resumos_semanais de que a API é dona.
  ganhos_brutos_app: number;
  ganhos_brutos_dinheiro: number;
  gorjetas: number;
  taxas_cancelamento: number;
  comissoes: number;
  portagens: number;
  taxas_reserva: number;
  viagens_terminadas: number;

  /**
   * A parte da identidade do bruto total que a API consegue cobrir:
   * app + dinheiro + gorjetas + cancelamentos. Falta-lhe campanha e reembolsos
   * de despesas, que só o CSV traz. É o número a comparar com a semana de
   * referência.
   */
  bruto_viagens: number;
}

export interface TotaisAgregacao {
  motoristas: number;
  orders_total: number;
  orders_finished: number;
  orders_cash: number;
  ganhos_brutos_app: number;
  ganhos_brutos_dinheiro: number;
  gorjetas: number;
  taxas_cancelamento: number;
  comissoes: number;
  portagens: number;
  taxas_reserva: number;
  bruto_viagens: number;
  ride_distance: number;
  distancia_total_km: number;
  parcelas: ParcelasBolt;
}

export interface TotalVariante {
  ganhos_brutos_app: number;
  ganhos_brutos_dinheiro: number;
  bruto_viagens: number;
}

export interface ResultadoAgregacao {
  formula_id: FormulaId;
  formula: string;
  linhas: LinhaAgregada[];
  /** Linhas recebidas da API — TENTATIVAS, não corridas. */
  ordens_total: number;
  /** Tentativas repetidas da mesma corrida, descartadas antes de somar. */
  ordens_repetidas: number;
  /** Sem driver_uuid E sem nome: não há chave possível, ficam de fora. */
  ordens_ignoradas: number;
  /** Sem order_price no corpo — contam para as viagens, não para o dinheiro. */
  ordens_sem_preco: number;
  /** Falha do motorista (driver_*): contam para o histórico, não para o dinheiro. */
  ordens_sem_pagamento: number;
  totais: TotaisAgregacao;
  /**
   * As quatro variantes calculadas na mesma passagem. Serve para calibrar sem
   * voltar a chamar a API: basta comparar com o alvo da semana conhecida.
   */
  variantes: Record<FormulaId, TotalVariante>;
}

export interface OpcoesAgregacao {
  formulaId?: FormulaId;
  /**
   * Divisor de ride_distance para chegar a km. A unidade não está confirmada
   * (provavelmente metros) — por isso o valor em bruto também é devolvido, e a
   * calibração faz-se aqui sem tocar no resto.
   */
  divisorDistancia?: number;
}

export const DIVISOR_DISTANCIA_POR_DEFEITO = 1000;

// ---------------------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------------------

interface Bucket {
  chave: string;
  driver_uuid: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  orders_total: number;
  orders_finished: number;
  orders_cash: number;
  todas: Centimos;
  app: Centimos;
  dinheiro: Centimos;
  distancia: number;
  /** Ordem de aparecimento, para a saída ser estável. */
  posicao: number;
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/**
 * Agrega as viagens de um período por motorista.
 *
 * A chave é COALESCE(driver_uuid, nome normalizado) — a mesma regra do
 * construirChaveMotorista usado pelo CSV e pela RPC. É o que faz a API COMPLETAR
 * a linha que o CSV já criou em vez de criar uma paralela.
 */
export function agregarPorMotorista(
  ordens: readonly FleetOrder[],
  opcoes: OpcoesAgregacao = {},
): ResultadoAgregacao {
  const formulaId = opcoes.formulaId ?? FORMULA_POR_DEFEITO;
  const divisor = opcoes.divisorDistancia && opcoes.divisorDistancia > 0
    ? opcoes.divisorDistancia
    : DIVISOR_DISTANCIA_POR_DEFEITO;

  const buckets = new Map<string, Bucket>();
  const globalTodas = novoAcumulador();
  const globalApp = novoAcumulador();
  const globalDinheiro = novoAcumulador();

  let ordensIgnoradas = 0;
  let ordensSemPreco = 0;
  let ordensSemPagamento = 0;
  let distanciaGlobal = 0;
  let terminadasGlobal = 0;
  let dinheiroGlobal = 0;

  // Antes de somar seja o que for: uma linha por corrida. Sem isto o mesmo
  // dinheiro entra tantas vezes quantas a Bolt despachou a corrida.
  const usadas = umaLinhaPorCorrida(ordens);
  const ordensRepetidas = ordens.length - usadas.length;

  for (const ordem of usadas) {
    const uuid = texto(ordem?.driver_uuid);
    const nome = texto(ordem?.driver_name);

    // Sem uuid e sem nome não há como identificar o motorista: a linha nunca
    // seria deduplicável e a RPC recusá-la-ia. Fica contada no log.
    const chave = construirChaveMotorista(uuid, null, nome);
    if (!chave) {
      ordensIgnoradas++;
      continue;
    }

    let bucket = buckets.get(chave);
    if (!bucket) {
      bucket = {
        chave,
        driver_uuid: uuid,
        driver_name: nome,
        driver_phone: texto(ordem?.driver_phone),
        orders_total: 0,
        orders_finished: 0,
        orders_cash: 0,
        todas: novoAcumulador(),
        app: novoAcumulador(),
        dinheiro: novoAcumulador(),
        distancia: 0,
        posicao: buckets.size,
      };
      buckets.set(chave, bucket);
    }

    // Preenche buracos sem apagar o que já se sabia (a Bolt manda o telefone
    // em umas ordens e não noutras).
    bucket.driver_uuid ??= uuid;
    bucket.driver_name ??= nome;
    bucket.driver_phone ??= texto(ordem?.driver_phone);

    const preco = ordem?.order_price;
    if (!preco) ordensSemPreco++;

    // Falha do motorista: a corrida conta para o histórico, o dinheiro não.
    const paga = eOrdemPaga(ordem?.order_status);
    if (!paga) ordensSemPagamento++;

    const emDinheiro = ePagamentoEmDinheiro(ordem?.payment_method);

    bucket.orders_total++;
    if (eOrdemTerminada(ordem?.order_status)) {
      bucket.orders_finished++;
      terminadasGlobal++;
    }
    if (emDinheiro) {
      bucket.orders_cash++;
      dinheiroGlobal++;
    }

    if (paga) {
      acumular(bucket.todas, preco);
      acumular(emDinheiro ? bucket.dinheiro : bucket.app, preco);

      const distancia = numero(ordem?.ride_distance);
      bucket.distancia += distancia;
      distanciaGlobal += distancia;
    }
  }

  const linhas: LinhaAgregada[] = [];

  for (const bucket of [...buckets.values()].sort((a, b) => a.posicao - b.posicao)) {
    somarAcumulador(globalTodas, bucket.todas);
    somarAcumulador(globalApp, bucket.app);
    somarAcumulador(globalDinheiro, bucket.dinheiro);

    const appCentimos = formulaCentimos(bucket.app, formulaId);
    const dinheiroCentimos = formulaCentimos(bucket.dinheiro, formulaId);
    const brutoCentimos = appCentimos + dinheiroCentimos + bucket.todas.tip +
      bucket.todas.cancellation_fee;

    const kmTotal = arredondar2(bucket.distancia / divisor);
    const denominador = bucket.orders_finished > 0 ? bucket.orders_finished : bucket.orders_total;

    linhas.push({
      chave: bucket.chave,
      driver_uuid: bucket.driver_uuid,
      driver_name: bucket.driver_name,
      driver_phone: bucket.driver_phone,
      orders_total: bucket.orders_total,
      orders_finished: bucket.orders_finished,
      orders_cash: bucket.orders_cash,
      parcelas: paraEuros(bucket.todas),
      parcelas_app: paraEuros(bucket.app),
      parcelas_dinheiro: paraEuros(bucket.dinheiro),
      ride_distance: arredondar2(bucket.distancia),
      distancia_total_km: kmTotal,
      distancia_media_km: denominador > 0 ? arredondar2(kmTotal / denominador) : 0,
      ganhos_brutos_app: appCentimos / 100,
      ganhos_brutos_dinheiro: dinheiroCentimos / 100,
      gorjetas: bucket.todas.tip / 100,
      taxas_cancelamento: bucket.todas.cancellation_fee / 100,
      comissoes: bucket.todas.commission / 100,
      portagens: bucket.todas.toll_fee / 100,
      taxas_reserva: bucket.todas.booking_fee / 100,
      viagens_terminadas: bucket.orders_finished,
      bruto_viagens: brutoCentimos / 100,
    });
  }

  const variantes = {} as Record<FormulaId, TotalVariante>;
  for (const id of FORMULAS_ID) {
    const app = formulaCentimos(globalApp, id);
    const dinheiro = formulaCentimos(globalDinheiro, id);
    variantes[id] = {
      ganhos_brutos_app: app / 100,
      ganhos_brutos_dinheiro: dinheiro / 100,
      bruto_viagens: (app + dinheiro + globalTodas.tip + globalTodas.cancellation_fee) / 100,
    };
  }

  const kmGlobal = arredondar2(distanciaGlobal / divisor);

  return {
    formula_id: formulaId,
    formula: FORMULAS[formulaId],
    linhas,
    ordens_total: ordens.length,
    ordens_repetidas: ordensRepetidas,
    ordens_ignoradas: ordensIgnoradas,
    ordens_sem_preco: ordensSemPreco,
    ordens_sem_pagamento: ordensSemPagamento,
    totais: {
      motoristas: linhas.length,
      orders_total: usadas.length - ordensIgnoradas,
      orders_finished: terminadasGlobal,
      orders_cash: dinheiroGlobal,
      ganhos_brutos_app: variantes[formulaId].ganhos_brutos_app,
      ganhos_brutos_dinheiro: variantes[formulaId].ganhos_brutos_dinheiro,
      gorjetas: globalTodas.tip / 100,
      taxas_cancelamento: globalTodas.cancellation_fee / 100,
      comissoes: globalTodas.commission / 100,
      portagens: globalTodas.toll_fee / 100,
      taxas_reserva: globalTodas.booking_fee / 100,
      bruto_viagens: variantes[formulaId].bruto_viagens,
      ride_distance: arredondar2(distanciaGlobal),
      distancia_total_km: kmGlobal,
      parcelas: paraEuros(globalTodas),
    },
    variantes,
  };
}
