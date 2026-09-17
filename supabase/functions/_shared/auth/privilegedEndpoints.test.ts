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
    // Auditoria 2026-09-16: dispatchers que só outras funções/pg_net chamam.
    "send-recibo-anulado-email",
    "send-brevo-email",
    "sync-driver-ids",
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

Deno.test("endpoints mistos de utilizador exigem membro da organização", async () => {
  // Auditoria 2026-09-16: chamados pela UI (sessão) e por chamadas internas
  // (service role); em ambos os casos a acção fica limitada a uma organização.
  for (
    const endpoint of [
      "send-webhook",
      "send-calendar-notification",
      "sync-campaign-sends",
    ]
  ) {
    const source = await readFunction(endpoint);
    assertStringIncludes(source, "authenticateUser(req,");
    assertStringIncludes(source, "isInternalRequest(req,");
    assertStringIncludes(source, "requireOrgMember(");
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

Deno.test("leituras de dados de uma organização exigem sessão e membro dessa organização", async () => {
  for (const endpoint of ["brevo-email-stats", "send-folha-danos-email"]) {
    const source = await readFunction(endpoint);
    assertStringIncludes(source, "authenticateUser(req,");
    assertStringIncludes(source, "requireOrgMember(");
  }
});

Deno.test("documentos de motorista só vão para a IA se a sessão os puder ver", async () => {
  const source = await readFunction("extract-document-expiry");
  assertStringIncludes(source, "authenticateUser(req,");
  assert(
    source.indexOf("authenticateUser(req,") < source.indexOf(".download(filePath)"),
    "o download acontece antes de autenticar o chamador",
  );
  assertStringIncludes(source, '.from(\'motorista_documentos\')');
  assertStringIncludes(source, '.from(\'motoristas_ativos\')');
});

Deno.test("webhook da Brevo exige o segredo do webhook antes de ler o corpo", async () => {
  const source = await readFunction("brevo-webhook");
  const guard = source.indexOf("requireInternalRequest(req, webhookSecret)");
  assert(guard >= 0, "brevo-webhook não valida BREVO_WEBHOOK_SECRET");
  assert(guard < source.indexOf("await req.json()"), "o corpo é lido antes da guarda");
  assertStringIncludes(source, 'Deno.env.get("BREVO_WEBHOOK_SECRET")');
});

Deno.test("sync-driver-ids nunca corre sem organização", async () => {
  const source = await readFunction("sync-driver-ids");
  assertStringIncludes(source, '.eq("org_id", orgId)');
  assert(!source.includes('.select("id, nome, email, telefone, bolt_id, uber_uuid");'));
});

Deno.test("import-viaturas não faz fetch de URLs do cliente", async () => {
  const source = await readFunction("import-viaturas");
  assert(!source.includes("fileUrl"), "import-viaturas voltou a aceitar fileUrl");
  assert(!source.includes("await fetch("), "import-viaturas faz fetch() de fora");
});

Deno.test("criação de utilizadores pelo servidor escreve org e cargo em app_metadata", async () => {
  // O trigger handle_new_user_org só aceita org/cargo de raw_app_meta_data
  // (que signUp não consegue escrever). Se um destes deixar de o passar, o
  // utilizador nasce sem organização.
  for (const endpoint of ["create-user", "register-org", "motorista-onboarding"]) {
    const source = await readFunction(endpoint);
    assertStringIncludes(source, "app_metadata:");
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
