import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  agregarPorMotorista,
  aplicarFormula,
  eFormulaId,
  ePagamentoEmDinheiro,
  type FormulaId,
  FORMULAS_ID,
} from "./agregar.ts";
import type { FleetOrder, OrderPriceData } from "./client.ts";

// ---------------------------------------------------------------------------
// Andaimes
// ---------------------------------------------------------------------------

const preco = (p: Partial<OrderPriceData> = {}): OrderPriceData => ({
  ride_price: 0,
  booking_fee: 0,
  toll_fee: 0,
  cancellation_fee: 0,
  tip: 0,
  net_earnings: 0,
  cash_discount: 0,
  in_app_discount: 0,
  commission: 0,
  ...p,
});

let contador = 0;
const ordem = (o: Partial<FleetOrder> = {}): FleetOrder => ({
  order_reference: `ref-${++contador}`,
  order_status: "finished",
  payment_method: "card",
  ...o,
});

/**
 * Fixture do caso normal: um motorista, três viagens terminadas na app.
 * Somas: ride 100,00 · booking 3,00 · toll 5,50 · tip 4,00 · in_app 2,00
 */
const ANA: FleetOrder[] = [
  ordem({
    driver_uuid: "uuid-ana",
    driver_name: "Ana Costa",
    driver_phone: "+351 912 345 678",
    ride_distance: 4000,
    order_price: preco({
      ride_price: 40,
      booking_fee: 1,
      toll_fee: 2.5,
      tip: 1.5,
      in_app_discount: 0.5,
      commission: 6,
      net_earnings: 34,
    }),
  }),
  ordem({
    driver_uuid: "uuid-ana",
    driver_name: "Ana Costa",
    ride_distance: 3000,
    order_price: preco({
      ride_price: 35,
      booking_fee: 1,
      toll_fee: 3,
      tip: 2.5,
      in_app_discount: 1.5,
      commission: 5,
      net_earnings: 30,
    }),
  }),
  ordem({
    driver_uuid: "uuid-ana",
    driver_name: "Ana Costa",
    ride_distance: 3000,
    order_price: preco({ ride_price: 25, booking_fee: 1, commission: 4, net_earnings: 21 }),
  }),
];

const soAna = (formulaId?: FormulaId) => {
  const resultado = agregarPorMotorista(ANA, formulaId ? { formulaId } : {});
  assertEquals(resultado.linhas.length, 1);
  return resultado;
};

// ---------------------------------------------------------------------------
// As quatro variantes da fórmula
// ---------------------------------------------------------------------------

Deno.test("V1 (por defeito) = Σ ride_price", () => {
  const resultado = soAna();
  assertEquals(resultado.formula_id, "V1");
  assertEquals(resultado.linhas[0].ganhos_brutos_app, 100);
});

Deno.test("V2 = Σ ride_price + Σ booking_fee + Σ toll_fee", () => {
  // 100 + 3 + 5,50
  assertEquals(soAna("V2").linhas[0].ganhos_brutos_app, 108.5);
});

Deno.test("V3 = Σ ride_price + Σ in_app_discount", () => {
  // 100 + 2
  assertEquals(soAna("V3").linhas[0].ganhos_brutos_app, 102);
});

Deno.test("V4 = V2 + Σ in_app_discount", () => {
  // 100 + 3 + 5,50 + 2
  assertEquals(soAna("V4").linhas[0].ganhos_brutos_app, 110.5);
});

Deno.test("as 4 variantes vêm todas calculadas na mesma passagem", () => {
  // É isto que permite calibrar contra a semana de referência sem repetir a
  // chamada à API.
  const { variantes } = soAna("V1");
  assertEquals(Object.keys(variantes).sort(), [...FORMULAS_ID].sort());
  assertEquals(variantes.V1.ganhos_brutos_app, 100);
  assertEquals(variantes.V2.ganhos_brutos_app, 108.5);
  assertEquals(variantes.V3.ganhos_brutos_app, 102);
  assertEquals(variantes.V4.ganhos_brutos_app, 110.5);
  // bruto_viagens = app + dinheiro + gorjetas + cancelamentos
  assertEquals(variantes.V1.bruto_viagens, 104);
});

Deno.test("a variante escolhida não altera gorjetas, comissões, portagens nem reservas", () => {
  for (const id of FORMULAS_ID) {
    const linha = soAna(id).linhas[0];
    assertEquals(linha.gorjetas, 4, `gorjetas em ${id}`);
    assertEquals(linha.comissoes, 15, `comissões em ${id}`);
    assertEquals(linha.portagens, 5.5, `portagens em ${id}`);
    assertEquals(linha.taxas_reserva, 3, `taxas de reserva em ${id}`);
  }
});

Deno.test("aplicarFormula: mesma conta a partir de parcelas já em euros", () => {
  const parcelas = soAna().linhas[0].parcelas_app;
  assertEquals(aplicarFormula(parcelas, "V1"), 100);
  assertEquals(aplicarFormula(parcelas, "V2"), 108.5);
  assertEquals(aplicarFormula(parcelas, "V3"), 102);
  assertEquals(aplicarFormula(parcelas, "V4"), 110.5);
});

Deno.test("eFormulaId aceita só as quatro", () => {
  assertEquals(eFormulaId("V3"), true);
  assertEquals(eFormulaId("v3"), false);
  assertEquals(eFormulaId("V5"), false);
  assertEquals(eFormulaId(undefined), false);
});

// ---------------------------------------------------------------------------
// Parcelas em bruto
// ---------------------------------------------------------------------------

Deno.test("as nove parcelas ficam guardadas em separado", () => {
  const p = soAna().linhas[0].parcelas;
  assertEquals(p.ride_price, 100);
  assertEquals(p.booking_fee, 3);
  assertEquals(p.toll_fee, 5.5);
  assertEquals(p.tip, 4);
  assertEquals(p.in_app_discount, 2);
  assertEquals(p.commission, 15);
  assertEquals(p.net_earnings, 85);
  assertEquals(p.cancellation_fee, 0);
  assertEquals(p.cash_discount, 0);
});

Deno.test("somas em cêntimos: 0,10 + 0,20 dá exactamente 0,30", () => {
  // Em vírgula flutuante daria 0.30000000000000004 e o resíduo da identidade
  // do bruto total deixava de ser 0,00 EUR.
  const resultado = agregarPorMotorista([
    ordem({ driver_uuid: "u", driver_name: "N", order_price: preco({ ride_price: 0.1 }) }),
    ordem({ driver_uuid: "u", driver_name: "N", order_price: preco({ ride_price: 0.2 }) }),
  ]);
  assertEquals(resultado.linhas[0].ganhos_brutos_app, 0.3);
});

// ---------------------------------------------------------------------------
// Ordens canceladas
// ---------------------------------------------------------------------------

Deno.test("cancelada: a taxa vai para taxas_cancelamento e não conta como viagem terminada", () => {
  const resultado = agregarPorMotorista([
    ...ANA,
    ordem({
      driver_uuid: "uuid-ana",
      driver_name: "Ana Costa",
      order_status: "client_did_not_show",
      ride_distance: 0,
      order_price: preco({ cancellation_fee: 3.5, commission: 0.5 }),
    }),
  ]);

  const linha = resultado.linhas[0];
  assertEquals(linha.orders_total, 4);
  assertEquals(linha.orders_finished, 3);
  assertEquals(linha.viagens_terminadas, 3);
  assertEquals(linha.taxas_cancelamento, 3.5);
  // A taxa de cancelamento NÃO entra no bruto da app — tem coluna própria na
  // identidade do bruto total.
  assertEquals(linha.ganhos_brutos_app, 100);
  assertEquals(linha.bruto_viagens, 107.5); // 100 + 0 + 4 + 3,50
  assertEquals(linha.comissoes, 15.5);
});

Deno.test("cancelada em todas as variantes: nunca migra para ganhos_brutos_app", () => {
  const ordens = [
    ordem({
      driver_uuid: "u",
      driver_name: "N",
      order_status: "cancelled",
      order_price: preco({ cancellation_fee: 2.5 }),
    }),
  ];
  for (const id of FORMULAS_ID) {
    const linha = agregarPorMotorista(ordens, { formulaId: id }).linhas[0];
    assertEquals(linha.ganhos_brutos_app, 0, `ganhos_brutos_app em ${id}`);
    assertEquals(linha.taxas_cancelamento, 2.5, `taxas_cancelamento em ${id}`);
    assertEquals(linha.viagens_terminadas, 0, `viagens_terminadas em ${id}`);
  }
});

// ---------------------------------------------------------------------------
// driver_uuid nulo
// ---------------------------------------------------------------------------

Deno.test("driver_uuid nulo: agrega pelo nome normalizado e não inventa identificador", () => {
  const resultado = agregarPorMotorista([
    ordem({ driver_name: "José Maria Óscar", order_price: preco({ ride_price: 10 }) }),
    ordem({ driver_name: "jose maria oscar", order_price: preco({ ride_price: 5 }) }),
  ]);

  assertEquals(resultado.linhas.length, 1);
  const linha = resultado.linhas[0];
  // A chave é o nome normalizado (acentos e maiúsculas não separam motoristas).
  assertEquals(linha.chave, "jose maria oscar");
  // p_identificador_motorista tem de ir a NULL: não há driver_uuid para gravar.
  assertEquals(linha.driver_uuid, null);
  assertEquals(linha.driver_name, "José Maria Óscar");
  assertEquals(linha.ganhos_brutos_app, 15);
  assertEquals(linha.orders_total, 2);
});

Deno.test("driver_uuid nulo numa ordem e presente noutra: são motoristas distintos", () => {
  // Comportamento assumido e documentado: sem uuid a chave é o nome, e as duas
  // linhas não se juntam. Melhor duas linhas visíveis do que uma fusão errada.
  const resultado = agregarPorMotorista([
    ordem({ driver_uuid: "uuid-1", driver_name: "Rui Silva", order_price: preco({ ride_price: 10 }) }),
    ordem({ driver_name: "Rui Silva", order_price: preco({ ride_price: 7 }) }),
  ]);

  assertEquals(resultado.linhas.length, 2);
  assertEquals(resultado.linhas[0].chave, "uuid-1");
  assertEquals(resultado.linhas[1].chave, "rui silva");
  assertEquals(resultado.totais.ganhos_brutos_app, 17);
});

Deno.test("sem uuid e sem nome: a ordem é ignorada e contada", () => {
  const resultado = agregarPorMotorista([
    ordem({ driver_name: "  ", order_price: preco({ ride_price: 99 }) }),
    ordem({ driver_uuid: "uuid-ok", driver_name: "Ok", order_price: preco({ ride_price: 1 }) }),
  ]);

  assertEquals(resultado.linhas.length, 1);
  assertEquals(resultado.ordens_ignoradas, 1);
  assertEquals(resultado.ordens_total, 2);
  // O dinheiro da ordem ignorada não entra em lado nenhum.
  assertEquals(resultado.totais.ganhos_brutos_app, 1);
  assertEquals(resultado.totais.orders_total, 1);
});

Deno.test("telefone e nome apanhados de qualquer ordem do motorista", () => {
  const resultado = agregarPorMotorista([
    ordem({ driver_uuid: "u", order_price: preco({ ride_price: 1 }) }),
    ordem({ driver_uuid: "u", driver_name: "Só Aqui", driver_phone: "912345678" }),
  ]);
  assertEquals(resultado.linhas[0].driver_name, "Só Aqui");
  assertEquals(resultado.linhas[0].driver_phone, "912345678");
});

// ---------------------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------------------

Deno.test("ePagamentoEmDinheiro reconhece as variantes e não se engana com 'cashless'", () => {
  assertEquals(ePagamentoEmDinheiro("cash"), true);
  assertEquals(ePagamentoEmDinheiro("CASH_IN_CAR"), true);
  assertEquals(ePagamentoEmDinheiro("dinheiro"), true);
  assertEquals(ePagamentoEmDinheiro("cashless"), false);
  assertEquals(ePagamentoEmDinheiro("card"), false);
  assertEquals(ePagamentoEmDinheiro(undefined), false);
});

Deno.test("dinheiro e app são baldes separados — nunca a mesma viagem nos dois", () => {
  const resultado = agregarPorMotorista([
    ordem({
      driver_uuid: "u",
      driver_name: "N",
      payment_method: "card",
      order_price: preco({ ride_price: 20 }),
    }),
    ordem({
      driver_uuid: "u",
      driver_name: "N",
      payment_method: "cash_in_car",
      order_price: preco({ ride_price: 12, tip: 1 }),
    }),
  ]);

  const linha = resultado.linhas[0];
  assertEquals(linha.ganhos_brutos_app, 20);
  assertEquals(linha.ganhos_brutos_dinheiro, 12);
  assertEquals(linha.orders_cash, 1);
  // A gorjeta conta uma vez só, venha de onde vier.
  assertEquals(linha.gorjetas, 1);
  assertEquals(linha.bruto_viagens, 33);
  assertEquals(linha.parcelas.ride_price, 32);
  assertEquals(linha.parcelas_dinheiro.ride_price, 12);
});

// ---------------------------------------------------------------------------
// Distância
// ---------------------------------------------------------------------------

Deno.test("distância: bruto sem conversão, km pelo divisor, média pelas terminadas", () => {
  const linha = soAna().linhas[0]; // 4000 + 3000 + 3000, 3 terminadas
  assertEquals(linha.ride_distance, 10000);
  assertEquals(linha.distancia_total_km, 10);
  assertAlmostEquals(linha.distancia_media_km, 3.33, 0.005);
});

Deno.test("divisor de distância configurável (a unidade da Bolt não está confirmada)", () => {
  const linha = agregarPorMotorista(ANA, { divisorDistancia: 1 }).linhas[0];
  assertEquals(linha.ride_distance, 10000);
  assertEquals(linha.distancia_total_km, 10000);
});

// ---------------------------------------------------------------------------
// Casos degenerados
// ---------------------------------------------------------------------------

Deno.test("sem ordens: resultado vazio e totais a zero (não escreve nada a jusante)", () => {
  const resultado = agregarPorMotorista([]);
  assertEquals(resultado.linhas.length, 0);
  assertEquals(resultado.ordens_total, 0);
  assertEquals(resultado.totais.bruto_viagens, 0);
  assertEquals(resultado.totais.motoristas, 0);
  assertEquals(resultado.variantes.V4.ganhos_brutos_app, 0);
});

Deno.test("ordem sem order_price conta como viagem mas não soma valor nenhum", () => {
  const resultado = agregarPorMotorista([
    ordem({ driver_uuid: "u", driver_name: "N" }),
    ordem({ driver_uuid: "u", driver_name: "N", order_price: preco({ ride_price: 8 }) }),
  ]);
  assertEquals(resultado.ordens_sem_preco, 1);
  assertEquals(resultado.linhas[0].orders_total, 2);
  assertEquals(resultado.linhas[0].ganhos_brutos_app, 8);
});

Deno.test("valores não numéricos da API não contaminam as somas", () => {
  const resultado = agregarPorMotorista([
    ordem({
      driver_uuid: "u",
      driver_name: "N",
      order_price: { ride_price: "12.50", tip: null } as unknown as OrderPriceData,
    }),
    ordem({
      driver_uuid: "u",
      driver_name: "N",
      order_price: preco({ ride_price: Number.NaN, tip: 1 }),
    }),
  ]);
  assertEquals(resultado.linhas[0].ganhos_brutos_app, 12.5);
  assertEquals(resultado.linhas[0].gorjetas, 1);
});

Deno.test("totais = soma das linhas", () => {
  const resultado = agregarPorMotorista([
    ...ANA,
    ordem({ driver_uuid: "uuid-b", driver_name: "Bruno", order_price: preco({ ride_price: 50, tip: 2 }) }),
  ], { formulaId: "V2" });

  assertEquals(resultado.linhas.length, 2);
  assertEquals(resultado.totais.motoristas, 2);
  assertEquals(
    resultado.totais.ganhos_brutos_app,
    resultado.linhas[0].ganhos_brutos_app + resultado.linhas[1].ganhos_brutos_app,
  );
  assertEquals(resultado.totais.gorjetas, 6);
  assertEquals(resultado.totais.orders_total, 4);
  assertEquals(resultado.totais.orders_finished, 4);
});
