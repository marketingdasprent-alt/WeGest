import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  createRobotWebhookSignature,
  verifyRobotWebhookSignature,
} from "./robotWebhookSecurity.ts";

Deno.test("assinatura do webhook fica vinculada à integração", async () => {
  const signature = await createRobotWebhookSignature(
    "integracao-a",
    "segredo-servidor",
  );

  assert(signature.length >= 64);
  assert(
    await verifyRobotWebhookSignature(
      "integracao-a",
      signature,
      "segredo-servidor",
    ),
  );
  assertEquals(
    await verifyRobotWebhookSignature(
      "integracao-b",
      signature,
      "segredo-servidor",
    ),
    false,
  );
});

Deno.test("assinatura do webhook rejeita valores ausentes ou adulterados", async () => {
  assertEquals(
    await verifyRobotWebhookSignature("integracao-a", null, "segredo-servidor"),
    false,
  );
  assertEquals(
    await verifyRobotWebhookSignature(
      "integracao-a",
      "assinatura-invalida",
      "segredo-servidor",
    ),
    false,
  );
});
