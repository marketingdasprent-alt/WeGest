import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildGenericEmailHtml } from "./buildGenericEmailHtml.ts";
import type { QueueItemEnrichment } from "./enrichContext.ts";

const semContexto: QueueItemEnrichment = {};

Deno.test("buildGenericEmailHtml inclui o corpo fornecido", () => {
  const html = buildGenericEmailHtml("Assunto de teste", "<p>Corpo do email</p>", semContexto);
  assertStringIncludes(html, "<p>Corpo do email</p>");
});

Deno.test("buildGenericEmailHtml inclui o título fornecido", () => {
  const html = buildGenericEmailHtml("Resumo diário — 3 aviso(s) novo(s)", "<p>x</p>", semContexto);
  assertStringIncludes(html, "Resumo diário — 3 aviso(s) novo(s)");
});

Deno.test("buildGenericEmailHtml mostra o botão 'Ver detalhes' quando há ctaUrl", () => {
  const ctx: QueueItemEnrichment = { ctaUrl: "https://minhaorg.wegest.pt/viaturas/abc" };
  const html = buildGenericEmailHtml("Assunto", "<p>x</p>", ctx);
  assertStringIncludes(html, "Ver detalhes");
  assertStringIncludes(html, "https://minhaorg.wegest.pt/viaturas/abc");
});

Deno.test("buildGenericEmailHtml não mostra botão nenhum sem ctaUrl", () => {
  const html = buildGenericEmailHtml("Assunto", "<p>x</p>", semContexto);
  const temBotao = html.includes("Ver detalhes");
  if (temBotao) {
    throw new Error("não devia haver botão sem ctaUrl");
  }
});

Deno.test("buildGenericEmailHtml usa o logótipo/nome da organização quando fornecidos", () => {
  const ctx: QueueItemEnrichment = { emissorNome: "Premium Ride", emissorLogoUrl: "https://exemplo.pt/logo.png" };
  const html = buildGenericEmailHtml("Assunto", "<p>x</p>", ctx);
  assertStringIncludes(html, "https://exemplo.pt/logo.png");
  assertStringIncludes(html, "Premium Ride");
});

Deno.test("buildGenericEmailHtml usa o logótipo da WeGest sem emissorNome", () => {
  const html = buildGenericEmailHtml("Assunto", "<p>x</p>", semContexto);
  assertStringIncludes(html, "wegest.pt/Logo.png");
});
