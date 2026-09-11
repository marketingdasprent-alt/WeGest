import { assert, assertStringIncludes } from "jsr:@std/assert@1.0.19";

const root = new URL("../../", import.meta.url);

async function readFunction(name: string): Promise<string> {
  return await Deno.readTextFile(new URL(`${name}/index.ts`, root));
}

Deno.test("workers privilegiados exigem a service role antes de criar o cliente de BD", async () => {
  const workers = [
    "bolt-full-sync",
    "bolt-auto-map-vehicles",
    "bolt-auto-map-driver-vehicles",
    "bolt-sync-drain",
    "bp-sync-cards",
    "bp-sync-transactions",
    "send-calendar-reminders",
    "send-notification-queue-email",
    "faturacao-outbox-drain",
    "acordos-parcelas-diario",
  ];

  for (const worker of workers) {
    const source = await readFunction(worker);
    const guard = source.indexOf("requireInternalRequest(req,");
    const privilegedClient = source.indexOf("createClient(", guard);
    assert(guard >= 0, `${worker} não tem guarda interna`);
    assert(
      privilegedClient > guard,
      `${worker} cria o cliente privilegiado antes da guarda`,
    );
  }
});

Deno.test("endpoints mistos autenticam utilizadores e validam admin da organização", async () => {
  for (
    const endpoint of [
      "bolt-auto-map-drivers",
      "bolt-rescue-apify",
      "uber-rescue-apify",
      "robot-execute",
      "robot-schedule",
    ]
  ) {
    const source = await readFunction(endpoint);
    assertStringIncludes(source, "authenticateUser(req,");
    assertStringIncludes(source, "isInternalRequest(req,");
    assertStringIncludes(source, "requireOrgAdmin(");
  }
});

Deno.test("ações de utilizador validam identidade e organização", async () => {
  for (
    const endpoint of [
      "assinatura-pedir",
      "send-documento-fiscal-email",
      "robot-webhook",
    ]
  ) {
    const source = await readFunction(endpoint);
    assertStringIncludes(source, "authenticateUser(req,");
    assertStringIncludes(source, "requireOrgAdmin(");
  }
});

Deno.test("callback robot exige assinatura vinculada à integração", async () => {
  const executeSource = await readFunction("robot-execute");
  const webhookSource = await readFunction("robot-webhook");

  assertStringIncludes(executeSource, "createRobotWebhookSignature(");
  assertStringIncludes(
    executeSource,
    'callbackUrl.searchParams.set("signature"',
  );
  assertStringIncludes(webhookSource, "verifyRobotWebhookSignature(");
});

Deno.test("envio de campanha exige admin da organização e assinatura da mesma org", async () => {
  const source = await readFunction("send-marketing-email");
  assertStringIncludes(source, "authenticateUser(req,");
  assertStringIncludes(source, "requireOrgAdmin(");
  assertStringIncludes(source, '.eq("org_id", orgId)');
  assertStringIncludes(source, "enviado_por: user.id");
  assert(
    source.indexOf('.from("marketing_listas")') <
      source.indexOf('.update({ status: "enviando", lista_id })'),
    "a lista tem de ser validada antes de alterar a campanha",
  );
});

Deno.test("created_by da assinatura vem do utilizador autenticado", async () => {
  const source = await readFunction("assinatura-pedir");
  assertStringIncludes(source, "created_by: user.id");
  assert(!source.includes("created_by: corpo.criadoPor"));
});
