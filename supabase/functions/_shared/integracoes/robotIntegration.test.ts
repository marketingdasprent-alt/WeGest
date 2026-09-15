import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  buildPublicApifyStatus,
  buildRobotIntegrationInsert,
  parseRobotIntegrationRequest,
  plataformaPodeCorrerRobo,
} from "./robotIntegration.ts";

Deno.test("estado público da Apify nunca inclui o token partilhado", () => {
  assertEquals(
    buildPublicApifyStatus({
      apify_actor_id: "actor-1",
      apify_api_token: "token-secreto",
    }),
    { configurado: true, apify_actor_id: "actor-1" },
  );
});

Deno.test("estado público indica quando não existem credenciais completas", () => {
  assertEquals(buildPublicApifyStatus(null), {
    configurado: false,
    apify_actor_id: null,
  });
});

Deno.test("pedido de integração aceita apenas plataformas de robot conhecidas", () => {
  for (const platform of ["uber", "bolt", "bp", "repsol", "edp", "viaverde"]) {
    assertEquals(
      parseRobotIntegrationRequest({
        nome: "Conta principal",
        login: "utilizador",
        password: "senha",
        robot_target_platform: platform,
      }).robot_target_platform,
      platform,
    );
  }

  assertThrows(
    () =>
      parseRobotIntegrationRequest({
        nome: "Conta principal",
        login: "utilizador",
        password: "senha",
        robot_target_platform: "desconhecida",
      }),
    Error,
    "Plataforma inválida",
  );
});

Deno.test("pedido de integração exige nome, login e password não vazios", () => {
  for (const field of ["nome", "login", "password"] as const) {
    const input = {
      nome: "Conta principal",
      login: "utilizador",
      password: "senha",
      robot_target_platform: "uber",
      [field]: "   ",
    };

    assertThrows(
      () => parseRobotIntegrationRequest(input),
      Error,
      `${field} é obrigatório`,
    );
  }
});

Deno.test("pedido normalizado não permite receber token, actor ou org do browser", () => {
  const request = parseRobotIntegrationRequest({
    nome: "  Conta principal  ",
    login: "  utilizador  ",
    password: "senha",
    robot_target_platform: "uber",
    apify_api_token: "ataque",
    apify_actor_id: "actor-injetado",
    org_id: "org-injetada",
  });

  assertEquals(request, {
    nome: "Conta principal",
    login: "utilizador",
    password: "senha",
    robot_target_platform: "uber",
  });
});

Deno.test("configuração da organização nunca recebe o token Apify partilhado", () => {
  const insert = buildRobotIntegrationInsert(
    {
      nome: "Conta principal",
      login: "utilizador",
      password: "senha",
      robot_target_platform: "bolt",
    },
    { apify_actor_id: "actor-partilhado", apify_api_token: "token-global" },
    "org-1",
    "user-1",
  );

  assertEquals(insert.apify_actor_id, "actor-partilhado");
  assertEquals(insert.apify_api_token, null);
});

// ---------------------------------------------------------------------------
// Que plataformas é que podem correr o robô
// ---------------------------------------------------------------------------

Deno.test("a Uber passa a poder correr o robô", () => {
  // O actor da Uber existe e já correu 52 vezes. O que estava errado era o
  // apify_actor_id gravado na BD, não a plataforma — mas o robot-execute
  // bloqueava a Uber à cabeça, por isso nem chegava a tentar.
  assertEquals(plataformaPodeCorrerRobo("uber"), true);
});

Deno.test("Via Verde e Bolt continuam a poder correr", () => {
  assertEquals(plataformaPodeCorrerRobo("viaverde"), true);
  assertEquals(plataformaPodeCorrerRobo("bolt"), true);
});

Deno.test("BP, Repsol e EDP continuam bloqueados", () => {
  // Zero execuções de sempre nos três actors (medido a 2026-09-14 na API do
  // Apify). Abrir a porta a robôs que nunca correram é convidar falhas
  // silenciosas — ficam de fora até alguém os validar.
  assertEquals(plataformaPodeCorrerRobo("bp"), false);
  assertEquals(plataformaPodeCorrerRobo("repsol"), false);
  assertEquals(plataformaPodeCorrerRobo("edp"), false);
});

Deno.test("uma plataforma desconhecida fica bloqueada", () => {
  assertEquals(plataformaPodeCorrerRobo("qualquer-coisa"), false);
  assertEquals(plataformaPodeCorrerRobo(null), false);
});
