import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BrevoProvider } from "./BrevoProvider.ts";
import type { EmailMessage } from "../types/index.ts";

const baseMessage: EmailMessage = {
  to: [{ email: "motorista@example.com" }],
  subject: "Assunto de teste",
  html: "<p>Corpo</p>",
};

Deno.test("BrevoProvider.send envia payload correto e devolve messageId em sucesso", async () => {
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> = {};

  const fakeFetch: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ messageId: "<abc123@brevo>" }), { status: 201 });
  };

  const provider = new BrevoProvider("fake-api-key", { name: "WeGest", email: "noreply@dasprent.pt" }, fakeFetch);
  const result = await provider.send(baseMessage);

  assertEquals(capturedUrl, "https://api.brevo.com/v3/smtp/email");
  assertEquals(capturedBody.subject, "Assunto de teste");
  assertEquals((capturedBody.sender as Record<string, unknown>).email, "noreply@dasprent.pt");
  assertEquals(result, { success: true, providerMessageId: "<abc123@brevo>" });
});

Deno.test("BrevoProvider.send devolve success:false com a mensagem de erro da Brevo", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 });

  const provider = new BrevoProvider("bad-key", undefined, fakeFetch);
  const result = await provider.send(baseMessage);

  assertEquals(result.success, false);
  assertEquals(result.error, "Invalid API key");
});

Deno.test("BrevoProvider.send trata falha de rede sem lançar excepção", async () => {
  const fakeFetch: typeof fetch = async () => {
    throw new TypeError("network error");
  };

  const provider = new BrevoProvider("any-key", undefined, fakeFetch);
  const result = await provider.send(baseMessage);

  assertEquals(result.success, false);
  assertEquals(result.error, "network error");
});

Deno.test("BrevoProvider.send usa senderOverride quando fornecido", async () => {
  let capturedBody: Record<string, unknown> = {};
  const fakeFetch: typeof fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ messageId: "x" }), { status: 201 });
  };

  const provider = new BrevoProvider("key", { name: "Default", email: "default@dasprent.pt" }, fakeFetch);
  await provider.send({ ...baseMessage, senderOverride: { name: "Empresa X", email: "org@empresa-x.pt" } });

  assertEquals((capturedBody.sender as Record<string, unknown>).email, "org@empresa-x.pt");
});
