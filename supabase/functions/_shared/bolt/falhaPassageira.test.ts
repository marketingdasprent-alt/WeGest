import { assertEquals } from "jsr:@std/assert@1";

import { falhaPassageira, MAX_TENTATIVAS, voltaATentar } from "./falhaPassageira.ts";

Deno.test("BOOT_ERROR e WORKER_LIMIT são passageiros, venha o HTTP que vier", () => {
  assertEquals(falhaPassageira(503, { code: "BOOT_ERROR", message: "Function failed to start" }), true);
  assertEquals(falhaPassageira(200, { code: "WORKER_LIMIT" }), true);
});

Deno.test("5xx e falha de rede são passageiros", () => {
  assertEquals(falhaPassageira(502, null), true);
  assertEquals(falhaPassageira(546, {}), true);
  assertEquals(falhaPassageira(null, null), true);
});

Deno.test("erros da Bolt ou dos dados não se repetem", () => {
  assertEquals(falhaPassageira(200, { success: false, error: "Credenciais inválidas" }), false);
  assertEquals(falhaPassageira(400, { error: "periodo_inicio em falta" }), false);
  assertEquals(falhaPassageira(401, null), false);
});

Deno.test("tenta no máximo MAX_TENTATIVAS vezes no total", () => {
  assertEquals(MAX_TENTATIVAS, 3);
  assertEquals(voltaATentar(0), true);
  assertEquals(voltaATentar(null), true);
  assertEquals(voltaATentar(1), true);
  assertEquals(voltaATentar(2), false);
});
