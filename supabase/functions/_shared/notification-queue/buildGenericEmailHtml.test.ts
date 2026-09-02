import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildGenericEmailHtml, datasEmPortugues, formatarCorpo } from "./buildGenericEmailHtml.ts";
import type { QueueItemEnrichment } from "./enrichContext.ts";

const semContexto: QueueItemEnrichment = {};

// ── A moldura ───────────────────────────────────────────────────────────────

Deno.test("buildGenericEmailHtml inclui o corpo fornecido", () => {
  const html = buildGenericEmailHtml("Assunto de teste", "Corpo do email", semContexto);
  assertStringIncludes(html, "Corpo do email");
});

Deno.test("buildGenericEmailHtml inclui o título fornecido", () => {
  const html = buildGenericEmailHtml("Resumo diário — 3 aviso(s) novo(s)", "x", semContexto);
  assertStringIncludes(html, "Resumo diário — 3 aviso(s) novo(s)");
});

Deno.test("buildGenericEmailHtml mostra o botão 'Ver detalhes' quando há ctaUrl", () => {
  const ctx: QueueItemEnrichment = { ctaUrl: "https://minhaorg.wegest.pt/viaturas/abc" };
  const html = buildGenericEmailHtml("Assunto", "x", ctx);
  assertStringIncludes(html, "Ver detalhes");
  assertStringIncludes(html, "https://minhaorg.wegest.pt/viaturas/abc");
});

Deno.test("buildGenericEmailHtml não mostra botão nenhum sem ctaUrl", () => {
  const html = buildGenericEmailHtml("Assunto", "x", semContexto);
  assertEquals(html.includes("Ver detalhes"), false);
});

Deno.test("buildGenericEmailHtml usa o logótipo/nome da organização quando fornecidos", () => {
  const ctx: QueueItemEnrichment = { emissorNome: "Premium Ride", emissorLogoUrl: "https://exemplo.pt/logo.png" };
  const html = buildGenericEmailHtml("Assunto", "x", ctx);
  assertStringIncludes(html, "https://exemplo.pt/logo.png");
  assertStringIncludes(html, "Premium Ride");
});

Deno.test("buildGenericEmailHtml usa o logótipo da WeGest sem emissorNome", () => {
  const html = buildGenericEmailHtml("Assunto", "x", semContexto);
  assertStringIncludes(html, "wegest.pt/Logo.png");
});

// ── O corpo ─────────────────────────────────────────────────────────────────

Deno.test("formatarCorpo transforma linhas 'Etiqueta: valor' numa tabela", () => {
  const html = formatarCorpo("Viatura: BS-96-XP\nCliente: Década Ousada, Lda.");
  assertStringIncludes(html, "<table");
  assertStringIncludes(html, "Viatura");
  assertStringIncludes(html, "BS-96-XP");
  assertStringIncludes(html, "Década Ousada, Lda.");
});

Deno.test("formatarCorpo mantém a prosa em parágrafos, não em tabela", () => {
  const html = formatarCorpo("O contrato 805 foi fechado e a recolha trouxe registo de danos.");
  assertStringIncludes(html, "<p");
  assertEquals(html.includes("<table"), false);
});

Deno.test("formatarCorpo separa prosa de campos no mesmo corpo", () => {
  const html = formatarCorpo("O contrato foi fechado.\n\nViatura: BS-96-XP\nKM de entrada: 63392");
  assertStringIncludes(html, "<p");
  assertStringIncludes(html, "<table");
  assertStringIncludes(html, "KM de entrada");
});

Deno.test("formatarCorpo não faz tabela de uma frase com dois pontos a meio", () => {
  // O digest: uma frase longa com dois pontos, seguida de HTML. Virava uma
  // linha de tabela absurda sem os limites de tamanho/palavras.
  const html = formatarCorpo("Tens 3 aviso(s) novo(s) hoje:<br><br>Seguro a expirar");
  assertEquals(html.includes("<table"), false);
});

Deno.test("formatarCorpo converte datas ISO para o formato português", () => {
  const html = formatarCorpo("Período: 2026-08-27T12:52:00+00:00 a 2026-09-16T19:32:00+00:00");
  assertStringIncludes(html, "27/08/2026");
  assertStringIncludes(html, "16/09/2026");
  assertEquals(html.includes("2026-08-27"), false);
});

Deno.test("datasEmPortugues não estraga um UUID nem um URL", () => {
  const original = "https://wegest.pt/renting/contratos/b63622d9-79b6-4096-9817-b8c44eb4436b";
  assertEquals(datasEmPortugues(original), original);
});
