import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  agregarPorMotorista,
  aplicarFormula,
  chaveDaCorrida,
  eFormulaId,
  eOrdemPaga,
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

// ---------------------------------------------------------------------------
// Uma corrida, várias tentativas
// ---------------------------------------------------------------------------

/** Referência real da Bolt: base64 de `<frota>-<corrida>-<tentativa>`. */
const ref = (frota: number, corrida: number, tentativa: number) =>
  btoa(`${frota}-${corrida}-${tentativa}`).replace(/=+$/, "");

Deno.test("chaveDaCorrida ignora a tentativa e fica pela corrida", () => {
  assertEquals(chaveDaCorrida(ref(1230, 1639363673, 3593827406)), "1230-1639363673");
  assertEquals(chaveDaCorrida(ref(1230, 1639363673, 3593835122)), "1230-1639363673");
  // Corridas diferentes não se fundem.
  assertEquals(chaveDaCorrida(ref(1230, 999, 1)) === chaveDaCorrida(ref(1230, 998, 1)), false);
});

Deno.test("chaveDaCorrida devolve a referência intacta quando não a reconhece", () => {
  // Sem isto, uma referência que descodifique para lixo podia colidir com
  // outra e fundir duas corridas diferentes.
  assertEquals(chaveDaCorrida("ref-7"), "ref-7");
  assertEquals(chaveDaCorrida(btoa("isto-nao-e-numerico")), btoa("isto-nao-e-numerico"));
  assertEquals(chaveDaCorrida(""), null);
  assertEquals(chaveDaCorrida(null), null);
});

Deno.test("caso Anabela (03-09/08/2026): a corrida cancelada e reposta conta UMA vez", () => {
  // A Bolt despachou a corrida 1639363673, a motorista cancelou depois de
  // aceitar, voltou a recebê-la 3 minutos depois e concluiu-a. A API devolve
  // as DUAS tentativas com os mesmos 6,20 EUR. Somá-las dava 140,45 EUR no
  // WeGest contra 134,19 EUR no relatório da Bolt.
  const mesmaCorrida = preco({ ride_price: 8.27, commission: 2.07, in_app_discount: 3.31, net_earnings: 6.2 });
  const resultado = agregarPorMotorista([
    ordem({
      order_reference: ref(1230, 1639363673, 3593827406),
      order_status: "driver_cancelled_after_accept",
      driver_uuid: "uuid-anabela",
      driver_name: "Anabela Gonçalves",
      order_price: mesmaCorrida,
    }),
    ordem({
      order_reference: ref(1230, 1639363673, 3593835122),
      order_status: "finished",
      driver_uuid: "uuid-anabela",
      driver_name: "Anabela Gonçalves",
      order_price: mesmaCorrida,
    }),
  ]);

  assertEquals(resultado.linhas.length, 1);
  assertEquals(resultado.linhas[0].parcelas.net_earnings, 6.2); // 12,40 = duplicado
  assertEquals(resultado.linhas[0].ganhos_brutos_app, 8.27);
  assertEquals(resultado.linhas[0].comissoes, 2.07);
  assertEquals(resultado.linhas[0].viagens_terminadas, 1);
  assertEquals(resultado.ordens_repetidas, 1);
});

Deno.test("a tentativa concluída manda, mesmo chegando primeiro a não concluída", () => {
  const p = preco({ ride_price: 10, net_earnings: 7.5 });
  for (const ordemDeChegada of [["driver_rejected", "finished"], ["finished", "driver_rejected"]]) {
    const resultado = agregarPorMotorista(
      ordemDeChegada.map((estado, i) =>
        ordem({
          order_reference: ref(98, 555, 100 + i),
          order_status: estado,
          driver_uuid: "u",
          driver_name: "N",
          order_price: p,
        })
      ),
    );
    assertEquals(resultado.linhas[0].parcelas.net_earnings, 7.5);
    assertEquals(resultado.linhas[0].viagens_terminadas, 1);
  }
});

Deno.test("corrida que trocou de motorista: o dinheiro fica com quem a concluiu", () => {
  // 7.283 corridas em produção mudaram de motorista e concluíram. Sem isto,
  // quem rejeitou ficava com uma cópia do dinheiro de quem a fez.
  const p = preco({ ride_price: 20, net_earnings: 15 });
  const resultado = agregarPorMotorista([
    ordem({
      order_reference: ref(98, 777, 1),
      order_status: "driver_rejected",
      driver_uuid: "quem-rejeitou",
      driver_name: "Rejeitou",
      order_price: p,
    }),
    ordem({
      order_reference: ref(98, 777, 2),
      order_status: "finished",
      driver_uuid: "quem-concluiu",
      driver_name: "Concluiu",
      order_price: p,
    }),
  ]);

  assertEquals(resultado.linhas.length, 1);
  assertEquals(resultado.linhas[0].driver_uuid, "quem-concluiu");
  assertEquals(resultado.linhas[0].parcelas.net_earnings, 15);
});

Deno.test("corrida nunca concluída também não se soma duas vezes", () => {
  const p = preco({ ride_price: 4, net_earnings: 3 });
  const resultado = agregarPorMotorista([
    ordem({ order_reference: ref(98, 888, 1), order_status: "client_cancelled", driver_uuid: "u", driver_name: "N", order_price: p }),
    ordem({ order_reference: ref(98, 888, 2), order_status: "driver_did_not_respond", driver_uuid: "u", driver_name: "N", order_price: p }),
  ]);

  assertEquals(resultado.linhas[0].parcelas.net_earnings, 3);
  assertEquals(resultado.linhas[0].viagens_terminadas, 0);
  assertEquals(resultado.ordens_repetidas, 1);
});

// ---------------------------------------------------------------------------
// Falha do motorista: a corrida conta, o dinheiro não
// ---------------------------------------------------------------------------

Deno.test("eOrdemPaga: paga o que o motorista fez e o que o cliente lhe estragou", () => {
  assertEquals(eOrdemPaga("finished"), true);
  // Culpa do cliente: a Bolt cobra-lhe a taxa e entrega-a ao motorista.
  assertEquals(eOrdemPaga("client_cancelled"), true);
  assertEquals(eOrdemPaga("client_did_not_show"), true);
  // Culpa do motorista: não recebe.
  assertEquals(eOrdemPaga("driver_cancelled_after_accept"), false);
  assertEquals(eOrdemPaga("driver_rejected"), false);
  assertEquals(eOrdemPaga("driver_did_not_respond"), false);
  // Um estado driver_* que a Bolt ainda não inventou é apanhado na mesma.
  assertEquals(eOrdemPaga("driver_cancelled_before_accept"), false);
  // Maiúsculas e espaços não enganam a regra.
  assertEquals(eOrdemPaga("  DRIVER_REJECTED  "), false);
});

Deno.test("driver_cancelled_after_accept: nem euros, nem km, nem viagem terminada", () => {
  const resultado = agregarPorMotorista([
    ordem({
      order_reference: ref(98, 4001, 1),
      order_status: "driver_cancelled_after_accept",
      driver_uuid: "u",
      driver_name: "N",
      ride_distance: 3000,
      order_price: preco({ cancellation_fee: 2.5, commission: 0.5, net_earnings: 2 }),
    }),
  ]);

  const linha = resultado.linhas[0];
  assertEquals(linha.parcelas.net_earnings, 0);
  assertEquals(linha.taxas_cancelamento, 0);
  assertEquals(linha.comissoes, 0);
  assertEquals(linha.bruto_viagens, 0);
  assertEquals(linha.distancia_total_km, 0);
  assertEquals(linha.viagens_terminadas, 0);
  // A corrida não desaparece do histórico — só não traz dinheiro.
  assertEquals(linha.orders_total, 1);
  assertEquals(resultado.ordens_sem_pagamento, 1);
});

Deno.test("client_cancelled continua a pagar a taxa ao motorista", () => {
  // 7.728,42 EUR em produção. Cortar os não-concluídos todos tirava-lhos.
  const resultado = agregarPorMotorista([
    ordem({
      order_reference: ref(98, 4002, 1),
      order_status: "client_cancelled",
      driver_uuid: "u",
      driver_name: "N",
      order_price: preco({ cancellation_fee: 4, commission: 1, net_earnings: 3 }),
    }),
  ]);

  const linha = resultado.linhas[0];
  assertEquals(linha.taxas_cancelamento, 4);
  assertEquals(linha.comissoes, 1);
  assertEquals(linha.parcelas.net_earnings, 3);
  assertEquals(resultado.ordens_sem_pagamento, 0);
});

Deno.test("uma semana inteira: só entra o que o motorista tem a receber", () => {
  const resultado = agregarPorMotorista([
    ordem({
      order_reference: ref(98, 5001, 1),
      order_status: "finished",
      driver_uuid: "u",
      driver_name: "N",
      order_price: preco({ ride_price: 10, commission: 2.5, net_earnings: 7.5 }),
    }),
    ordem({
      order_reference: ref(98, 5002, 1),
      order_status: "client_did_not_show",
      driver_uuid: "u",
      driver_name: "N",
      order_price: preco({ cancellation_fee: 2, commission: 0.5, net_earnings: 1.5 }),
    }),
    ordem({
      order_reference: ref(98, 5003, 1),
      order_status: "driver_rejected",
      driver_uuid: "u",
      driver_name: "N",
      order_price: preco({ cancellation_fee: 3, commission: 0.75, net_earnings: 2.25 }),
    }),
  ]);

  const linha = resultado.linhas[0];
  assertEquals(linha.parcelas.net_earnings, 9); // 7,50 + 1,50 (os 2,25 ficam de fora)
  assertEquals(linha.taxas_cancelamento, 2); // só a do cliente
  assertEquals(linha.comissoes, 3); // 2,50 + 0,50
  assertEquals(linha.viagens_terminadas, 1);
  assertEquals(linha.orders_total, 3);
  assertEquals(resultado.ordens_sem_pagamento, 1);
});

Deno.test("nenhuma concluida: fica a do cliente, nao a do motorista que chegou primeiro", () => {
  // 98 corridas em producao: o motorista nao atendeu, o cliente cancelou a
  // seguir, e a taxa de cancelamento ficou agarrada a segunda tentativa.
  // Ficar com a primeira deitava fora 314,83 EUR que sao dos motoristas.
  const resultado = agregarPorMotorista([
    ordem({
      order_reference: ref(98, 6001, 1),
      order_status: "driver_did_not_respond",
      driver_uuid: "u",
      driver_name: "N",
      order_price: preco({}),
    }),
    ordem({
      order_reference: ref(98, 6001, 2),
      order_status: "client_cancelled",
      driver_uuid: "u",
      driver_name: "N",
      order_price: preco({ cancellation_fee: 3.2, commission: 0.8, net_earnings: 2.4 }),
    }),
  ]);

  assertEquals(resultado.linhas.length, 1);
  assertEquals(resultado.linhas[0].taxas_cancelamento, 3.2);
  assertEquals(resultado.linhas[0].parcelas.net_earnings, 2.4);
  assertEquals(resultado.ordens_sem_pagamento, 0);
});

Deno.test("a concluida ganha a do cliente, esteja onde estiver na lista", () => {
  const daClientela = preco({ cancellation_fee: 3, commission: 0.75, net_earnings: 2.25 });
  const daConcluida = preco({ ride_price: 12, commission: 3, net_earnings: 9 });
  for (const invertida of [false, true]) {
    const linhas = [
      ordem({ order_reference: ref(98, 6002, 1), order_status: "client_cancelled", driver_uuid: "u", driver_name: "N", order_price: daClientela }),
      ordem({ order_reference: ref(98, 6002, 2), order_status: "finished", driver_uuid: "u", driver_name: "N", order_price: daConcluida }),
    ];
    const resultado = agregarPorMotorista(invertida ? [...linhas].reverse() : linhas);
    assertEquals(resultado.linhas[0].parcelas.net_earnings, 9);
    assertEquals(resultado.linhas[0].taxas_cancelamento, 0);
    assertEquals(resultado.linhas[0].viagens_terminadas, 1);
  }
});

// ---------------------------------------------------------------------------
// O meio centimo que a Bolt arredonda duas vezes
// ---------------------------------------------------------------------------

Deno.test("arredondamento duplo: 4,50 a 25% da 3,38 + 1,13 = 4,51 (um centimo do nada)", () => {
  // 4,50 x 0,25 = 1,125 -> comissao 1,13 (subiu meio centimo)
  // 4,50 x 0,75 = 3,375 -> liquido  3,38 (subiu meio centimo)
  // Somados dao 4,51 para uma corrida de 4,50. Uma corrida so, um centimo.
  const resultado = agregarPorMotorista([
    ordem({
      order_reference: ref(98, 7001, 1),
      driver_uuid: "u", driver_name: "N",
      order_price: preco({ ride_price: 4.5, commission: 1.13, net_earnings: 3.38 }),
    }),
  ]);
  // O exacto e 3,375 / 1,125; a linha semanal trunca ao centimo, como a Bolt.
  assertEquals(resultado.linhas[0].parcelas.net_earnings, 3.37);
  assertEquals(resultado.linhas[0].comissoes, 1.12);
});

Deno.test("sem arredondamento duplo nao se mexe em nada", () => {
  // 4,69 x 0,25 = 1,1725 -> 1,17; 4,69 - 1,17 = 3,52 = liquido. Fecha certo.
  const resultado = agregarPorMotorista([
    ordem({
      order_reference: ref(98, 7002, 1),
      driver_uuid: "u", driver_name: "N",
      order_price: preco({ ride_price: 4.69, commission: 1.17, net_earnings: 3.52 }),
    }),
  ]);
  assertEquals(resultado.linhas[0].parcelas.net_earnings, 3.52);
  assertEquals(resultado.linhas[0].comissoes, 1.17);
});

Deno.test("caso Anabela: as 26 corridas de 03-09/08 dao 134,19 como no relatorio", () => {
  // Valores REAIS da semana. 11 das 26 tem o arredondamento duplo; somar os
  // liquidos ja arredondados dava 134,25 e o relatorio da Bolt diz 134,19.
  const semana: Array<[number, number, number]> = [
    // [ride_price, commission, net_earnings]
    [4.50, 1.13, 3.38], [4.50, 1.13, 3.38], [4.50, 1.13, 3.38], [4.50, 1.13, 3.38],
    [4.50, 1.13, 3.38], [4.62, 1.16, 3.47], [4.62, 1.16, 3.47], [4.66, 1.17, 3.50],
    [4.69, 1.17, 3.52], [4.73, 1.18, 3.55], [4.95, 1.24, 3.71], [4.95, 1.24, 3.71],
    [5.20, 1.30, 3.90], [5.30, 1.33, 3.98], [6.01, 1.50, 4.51], [6.19, 1.55, 4.64],
    [7.03, 1.76, 5.27], [7.22, 1.81, 5.42], [8.27, 2.07, 6.20], [8.42, 1.48, 6.95],
    [10.00, 2.50, 7.50], [10.09, 2.52, 7.57], [11.16, 2.79, 8.37], [11.29, 2.82, 8.47],
    [11.77, 2.06, 9.71], [13.24, 3.31, 9.93],
  ];

  const resultado = agregarPorMotorista(
    semana.map(([ride, com, net], i) =>
      ordem({
        order_reference: ref(1230, 8000 + i, 1),
        driver_uuid: "uuid-anabela",
        driver_name: "Anabela Gonçalves",
        order_price: preco({ ride_price: ride, commission: com, net_earnings: net }),
      })
    ),
  );

  assertEquals(resultado.linhas[0].viagens_terminadas, 26);
  // 134,25 era o que mostravamos; 134,19 e o relatorio da Bolt.
  assertEquals(resultado.linhas[0].parcelas.net_earnings, 134.19);
});
