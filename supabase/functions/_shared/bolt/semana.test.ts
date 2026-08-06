import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  analisarData,
  diaDaSemana,
  formatarData,
  hojeEmLisboa,
  instanteEmLisboa,
  segundaDaSemana,
  semanaEntre,
  semanaPassada,
  somarDias,
} from "./semana.ts";

/** Instante em segundos → texto ISO em UTC, para os testes serem legíveis. */
const iso = (segundos: number) => new Date(segundos * 1000).toISOString();

// ---------------------------------------------------------------------------
// O que isto tem de garantir: as fronteiras são de Lisboa, não de UTC
// ---------------------------------------------------------------------------

Deno.test("Inverno (UTC+0): a semana começa à meia-noite UTC", () => {
  const semana = semanaEntre({ ano: 2026, mes: 1, dia: 5 }, { ano: 2026, mes: 1, dia: 11 });
  assertEquals(iso(semana.start_ts), "2026-01-05T00:00:00.000Z");
  assertEquals(iso(semana.end_ts), "2026-01-11T23:59:59.000Z");
});

Deno.test("Verão (UTC+1): a semana começa às 23:00 UTC do domingo anterior", () => {
  // É esta hora que o cálculo em UTC perdia: as viagens entre as 00:00 e a
  // 01:00 de segunda em Lisboa caíam na semana anterior.
  const semana = semanaEntre({ ano: 2026, mes: 7, dia: 6 }, { ano: 2026, mes: 7, dia: 12 });
  assertEquals(iso(semana.start_ts), "2026-07-05T23:00:00.000Z");
  assertEquals(iso(semana.end_ts), "2026-07-12T22:59:59.000Z");
});

Deno.test("a semana de referência (2026-07-06) tem exactamente 7 dias de duração", () => {
  const semana = semanaEntre({ ano: 2026, mes: 7, dia: 6 }, { ano: 2026, mes: 7, dia: 12 });
  assertEquals(semana.end_ts - semana.start_ts + 1, 7 * 24 * 3600);
});

Deno.test("semana da mudança para a hora de Verão: 7 dias menos 1 hora", () => {
  // Último domingo de Março de 2026 = dia 29. A semana 23–29 de Março perde
  // uma hora real; o intervalo pedido à Bolt tem de reflectir isso, senão
  // sobrepõe-se à semana seguinte.
  const semana = semanaEntre({ ano: 2026, mes: 3, dia: 23 }, { ano: 2026, mes: 3, dia: 29 });
  assertEquals(iso(semana.start_ts), "2026-03-23T00:00:00.000Z");
  assertEquals(iso(semana.end_ts), "2026-03-29T22:59:59.000Z");
  assertEquals(semana.end_ts - semana.start_ts + 1, 7 * 24 * 3600 - 3600);
});

Deno.test("semana da mudança para a hora de Inverno: 7 dias mais 1 hora", () => {
  // Último domingo de Outubro de 2026 = dia 25.
  const semana = semanaEntre({ ano: 2026, mes: 10, dia: 19 }, { ano: 2026, mes: 10, dia: 25 });
  assertEquals(iso(semana.start_ts), "2026-10-18T23:00:00.000Z");
  assertEquals(iso(semana.end_ts), "2026-10-25T23:59:59.000Z");
  assertEquals(semana.end_ts - semana.start_ts + 1, 7 * 24 * 3600 + 3600);
});

Deno.test("instanteEmLisboa: a hora que não existe (2026-03-29 01:30) não rebenta", () => {
  // Entre 01:00 e 02:00 desse domingo o relógio salta. Qualquer resultado
  // estável serve; o que não pode é sair NaN nem uma data absurda.
  const ms = instanteEmLisboa({ ano: 2026, mes: 3, dia: 29 }, 1, 30, 0);
  assertEquals(Number.isFinite(ms), true);
  assertEquals(new Date(ms).toISOString().startsWith("2026-03-29"), true);
});

// ---------------------------------------------------------------------------
// Semana passada
// ---------------------------------------------------------------------------

Deno.test("semanaPassada: a partir de uma quarta-feira dá a 2ª–Dom anterior", () => {
  // 2026-07-15 é uma quarta-feira.
  const semana = semanaPassada(new Date("2026-07-15T10:00:00Z"));
  assertEquals(semana.inicio, "2026-07-06");
  assertEquals(semana.fim, "2026-07-12");
  assertEquals(semana.periodo, "2026-07-06 a 2026-07-12");
});

Deno.test("semanaPassada: numa segunda-feira dá a semana imediatamente anterior", () => {
  // 2026-07-13, segunda. A semana que acabou ontem.
  const semana = semanaPassada(new Date("2026-07-13T09:00:00Z"));
  assertEquals(semana.inicio, "2026-07-06");
  assertEquals(semana.fim, "2026-07-12");
});

Deno.test("semanaPassada: num domingo ainda é a semana anterior (a corrente não fechou)", () => {
  // 2026-07-12, domingo.
  const semana = semanaPassada(new Date("2026-07-12T20:00:00Z"));
  assertEquals(semana.inicio, "2026-06-29");
  assertEquals(semana.fim, "2026-07-05");
});

Deno.test("semanaPassada: 23:30 UTC de domingo já é segunda em Lisboa (Verão)", () => {
  // O caso que o cálculo em UTC erra: às 23:30Z de domingo 12/07 já são 00:30
  // de segunda 13/07 em Lisboa, portanto a semana passada é a de 06 a 12 —
  // e não a de 29/06 a 05/07.
  const semana = semanaPassada(new Date("2026-07-12T23:30:00Z"));
  assertEquals(semana.inicio, "2026-07-06");
  assertEquals(semana.fim, "2026-07-12");
});

Deno.test("semanaPassada: 00:30 UTC de segunda no Inverno continua a ser segunda", () => {
  const semana = semanaPassada(new Date("2026-01-12T00:30:00Z"));
  assertEquals(semana.inicio, "2026-01-05");
  assertEquals(semana.fim, "2026-01-11");
});

Deno.test("semanaPassada atravessa a viragem do ano", () => {
  // 2026-01-01 é uma quinta-feira; a semana passada é 22–28 de Dezembro.
  const semana = semanaPassada(new Date("2026-01-01T12:00:00Z"));
  assertEquals(semana.inicio, "2025-12-22");
  assertEquals(semana.fim, "2025-12-28");
});

// ---------------------------------------------------------------------------
// Auxiliares de calendário
// ---------------------------------------------------------------------------

Deno.test("segundaDaSemana", () => {
  assertEquals(formatarData(segundaDaSemana({ ano: 2026, mes: 7, dia: 6 })), "2026-07-06"); // 2ª
  assertEquals(formatarData(segundaDaSemana({ ano: 2026, mes: 7, dia: 12 })), "2026-07-06"); // Dom
  assertEquals(formatarData(segundaDaSemana({ ano: 2026, mes: 7, dia: 9 })), "2026-07-06"); // 5ª
});

Deno.test("diaDaSemana: 0 = domingo", () => {
  assertEquals(diaDaSemana({ ano: 2026, mes: 7, dia: 12 }), 0);
  assertEquals(diaDaSemana({ ano: 2026, mes: 7, dia: 6 }), 1);
});

Deno.test("somarDias atravessa meses e anos", () => {
  assertEquals(formatarData(somarDias({ ano: 2026, mes: 2, dia: 27 }, 2)), "2026-03-01");
  assertEquals(formatarData(somarDias({ ano: 2026, mes: 1, dia: 1 }, -1)), "2025-12-31");
  // 2024 foi bissexto.
  assertEquals(formatarData(somarDias({ ano: 2024, mes: 2, dia: 28 }, 1)), "2024-02-29");
});

Deno.test("hojeEmLisboa usa a data civil de Lisboa, não a de UTC", () => {
  // 23:30Z de 5 de Julho já é dia 6 em Lisboa.
  assertEquals(formatarData(hojeEmLisboa(new Date("2026-07-05T23:30:00Z"))), "2026-07-06");
  assertEquals(formatarData(hojeEmLisboa(new Date("2026-01-05T23:30:00Z"))), "2026-01-05");
});

// ---------------------------------------------------------------------------
// analisarData
// ---------------------------------------------------------------------------

Deno.test("analisarData aceita YYYY-MM-DD e ignora a hora que venha atrás", () => {
  assertEquals(analisarData("2026-07-06"), { ano: 2026, mes: 7, dia: 6 });
  assertEquals(analisarData(" 2026-07-06T00:00:00Z "), { ano: 2026, mes: 7, dia: 6 });
});

Deno.test("analisarData recusa lixo e datas que não existem", () => {
  assertEquals(analisarData("06/07/2026"), null);
  assertEquals(analisarData("2026-02-31"), null);
  assertEquals(analisarData("2026-13-01"), null);
  assertEquals(analisarData(""), null);
  assertEquals(analisarData(null), null);
  assertEquals(analisarData(20260706), null);
});

Deno.test("periodo tem o formato exacto de bolt_resumos_semanais.periodo", () => {
  // 'YYYY-MM-DD a YYYY-MM-DD'. Outro formato criava um universo paralelo de
  // linhas para a mesma semana.
  assertEquals(
    semanaEntre({ ano: 2026, mes: 7, dia: 6 }, { ano: 2026, mes: 7, dia: 12 }).periodo,
    "2026-07-06 a 2026-07-12",
  );
});
