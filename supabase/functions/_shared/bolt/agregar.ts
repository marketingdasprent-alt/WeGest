import type { FleetOrder, OrderPriceData } from './client.ts';
import { construirChaveMotorista, normalizeStr } from '../bolt-import-csv/parse.ts';

export type FormulaId = 'V1' | 'V2' | 'V3' | 'V4';

export const FORMULAS: Readonly<Record<FormulaId, string>> = {
  V1: 'Σ ride_price',
  V2: 'Σ ride_price + Σ booking_fee + Σ toll_fee',
  V3: 'Σ ride_price + Σ in_app_discount',
  V4: 'Σ ride_price + Σ booking_fee + Σ toll_fee + Σ in_app_discount',
};

export const FORMULAS_ID = Object.keys(FORMULAS) as FormulaId[];

export const FORMULA_POR_DEFEITO: FormulaId = 'V1';

export function eFormulaId(valor: unknown): valor is FormulaId {
  return typeof valor === 'string' && (FORMULAS_ID as string[]).includes(valor);
}

export const CHAVES_PARCELAS = [
  'ride_price',
  'booking_fee',
  'toll_fee',
  'cancellation_fee',
  'tip',
  'net_earnings',
  'cash_discount',
  'in_app_discount',
  'commission',
] as const;

export type ChaveParcela = (typeof CHAVES_PARCELAS)[number];

export type ParcelasBolt = Record<ChaveParcela, number>;

type Centimos = Record<ChaveParcela, number>;

function novoAcumulador(): Centimos {
  const zero = {} as Centimos;
  for (const chave of CHAVES_PARCELAS) zero[chave] = 0;
  return zero;
}

function numero(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function paraCentimos(valor: unknown): number {
  return Math.round(numero(valor) * 100);
}

function acumular(destino: Centimos, preco: OrderPriceData | undefined): void {
  if (!preco) return;
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

function temArredondamentoDuplo(preco: OrderPriceData | undefined): boolean {
  if (!preco) return false;
  const c = (v: unknown) => paraCentimos(v);
  const esperado =
    c(preco.ride_price) +
    c(preco.booking_fee) +
    c(preco.toll_fee) +
    c(preco.tip) -
    c(preco.commission);
  return c(preco.net_earnings) - esperado === 1;
}

function eurosSemMeios(centimos: number, meios: number): number {
  return Math.trunc((centimos * 10 - meios * 5) / 10) / 100;
}

function formulaCentimos(c: Centimos, formulaId: FormulaId): number {
  switch (formulaId) {
    case 'V2':
      return c.ride_price + c.booking_fee + c.toll_fee;
    case 'V3':
      return c.ride_price + c.in_app_discount;
    case 'V4':
      return c.ride_price + c.booking_fee + c.toll_fee + c.in_app_discount;
    case 'V1':
    default:
      return c.ride_price;
  }
}

export function aplicarFormula(parcelas: ParcelasBolt, formulaId: FormulaId): number {
  const centimos = novoAcumulador();
  for (const chave of CHAVES_PARCELAS) centimos[chave] = paraCentimos(parcelas[chave]);
  return formulaCentimos(centimos, formulaId) / 100;
}

export function ePagamentoEmDinheiro(metodo?: string | null): boolean {
  if (!metodo) return false;
  return /\b(cash|dinheiro|numerario)\b/.test(normalizeStr(metodo));
}

export function eOrdemTerminada(estado?: string | null): boolean {
  return (estado ?? '').trim().toLowerCase() === 'finished';
}

export function eOrdemPaga(estado?: string | null): boolean {
  const e = (estado ?? '').trim().toLowerCase();
  if (e === 'finished') return true;
  return !e.startsWith('driver_');
}

export function chaveDaCorrida(referencia?: string | null): string | null {
  const ref = texto(referencia);
  if (!ref) return null;

  let legivel: string;
  try {
    const normalizada = ref.replace(/-/g, '+').replace(/_/g, '/');
    legivel = atob(normalizada + '='.repeat((4 - (normalizada.length % 4)) % 4));
  } catch {
    return ref;
  }

  const partes = /^(\d+)-(\d+)-(\d+)$/.exec(legivel);
  return partes ? `${partes[1]}-${partes[2]}` : ref;
}

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

export interface LinhaAgregada {
  chave: string;
  driver_uuid: string | null;
  driver_name: string | null;
  driver_phone: string | null;

  orders_total: number;
  orders_finished: number;
  orders_cash: number;

  parcelas: ParcelasBolt;
  parcelas_app: ParcelasBolt;
  parcelas_dinheiro: ParcelasBolt;

  ride_distance: number;
  distancia_total_km: number;
  distancia_media_km: number;

  ganhos_brutos_app: number;
  ganhos_brutos_dinheiro: number;
  gorjetas: number;
  taxas_cancelamento: number;
  comissoes: number;
  portagens: number;
  taxas_reserva: number;
  viagens_terminadas: number;

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
  ordens_total: number;
  ordens_repetidas: number;
  ordens_ignoradas: number;
  ordens_sem_preco: number;
  ordens_sem_pagamento: number;
  totais: TotaisAgregacao;
  variantes: Record<FormulaId, TotalVariante>;
}

export interface OpcoesAgregacao {
  formulaId?: FormulaId;
  divisorDistancia?: number;
}

export const DIVISOR_DISTANCIA_POR_DEFEITO = 1000;

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
  meios: number;
  distancia: number;
  posicao: number;
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

export function agregarPorMotorista(
  ordens: readonly FleetOrder[],
  opcoes: OpcoesAgregacao = {}
): ResultadoAgregacao {
  const formulaId = opcoes.formulaId ?? FORMULA_POR_DEFEITO;
  const divisor =
    opcoes.divisorDistancia && opcoes.divisorDistancia > 0
      ? opcoes.divisorDistancia
      : DIVISOR_DISTANCIA_POR_DEFEITO;

  const buckets = new Map<string, Bucket>();
  const globalTodas = novoAcumulador();
  const globalApp = novoAcumulador();
  const globalDinheiro = novoAcumulador();

  let ordensIgnoradas = 0;
  let ordensSemPreco = 0;
  let ordensSemPagamento = 0;
  let meiosGlobal = 0;
  let distanciaGlobal = 0;
  let terminadasGlobal = 0;
  let dinheiroGlobal = 0;

  const usadas = umaLinhaPorCorrida(ordens);
  const ordensRepetidas = ordens.length - usadas.length;

  for (const ordem of usadas) {
    const uuid = texto(ordem?.driver_uuid);
    const nome = texto(ordem?.driver_name);

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
        meios: 0,
        distancia: 0,
        posicao: buckets.size,
      };
      buckets.set(chave, bucket);
    }

    bucket.driver_uuid ??= uuid;
    bucket.driver_name ??= nome;
    bucket.driver_phone ??= texto(ordem?.driver_phone);

    const preco = ordem?.order_price;
    if (!preco) ordensSemPreco++;

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
      if (temArredondamentoDuplo(preco)) {
        bucket.meios++;
        meiosGlobal++;
      }

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
    const brutoCentimos =
      appCentimos + dinheiroCentimos + bucket.todas.tip + bucket.todas.cancellation_fee;

    const kmTotal = arredondar2(bucket.distancia / divisor);
    const denominador = bucket.orders_finished > 0 ? bucket.orders_finished : bucket.orders_total;

    const parcelas = paraEuros(bucket.todas);
    parcelas.net_earnings = eurosSemMeios(bucket.todas.net_earnings, bucket.meios);
    parcelas.commission = eurosSemMeios(bucket.todas.commission, bucket.meios);

    linhas.push({
      chave: bucket.chave,
      driver_uuid: bucket.driver_uuid,
      driver_name: bucket.driver_name,
      driver_phone: bucket.driver_phone,
      orders_total: bucket.orders_total,
      orders_finished: bucket.orders_finished,
      orders_cash: bucket.orders_cash,
      parcelas,
      parcelas_app: paraEuros(bucket.app),
      parcelas_dinheiro: paraEuros(bucket.dinheiro),
      ride_distance: arredondar2(bucket.distancia),
      distancia_total_km: kmTotal,
      distancia_media_km: denominador > 0 ? arredondar2(kmTotal / denominador) : 0,
      ganhos_brutos_app: appCentimos / 100,
      ganhos_brutos_dinheiro: dinheiroCentimos / 100,
      gorjetas: bucket.todas.tip / 100,
      taxas_cancelamento: bucket.todas.cancellation_fee / 100,
      comissoes: parcelas.commission,
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

  const parcelasGlobais = paraEuros(globalTodas);
  parcelasGlobais.net_earnings = eurosSemMeios(globalTodas.net_earnings, meiosGlobal);
  parcelasGlobais.commission = eurosSemMeios(globalTodas.commission, meiosGlobal);

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
      comissoes: parcelasGlobais.commission,
      portagens: globalTodas.toll_fee / 100,
      taxas_reserva: globalTodas.booking_fee / 100,
      bruto_viagens: variantes[formulaId].bruto_viagens,
      ride_distance: arredondar2(distanciaGlobal),
      distancia_total_km: kmGlobal,
      parcelas: parcelasGlobais,
    },
    variantes,
  };
}
