import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderTemplate } from "./renderTemplate.ts";

Deno.test("substitui uma variável simples", () => {
  assertEquals(renderTemplate("Olá {{nome}}", { nome: "João" }), "Olá João");
});

Deno.test("substitui múltiplas variáveis", () => {
  assertEquals(
    renderTemplate("{{saudacao}}, {{nome}}!", { saudacao: "Bom dia", nome: "Maria" }),
    "Bom dia, Maria!",
  );
});

Deno.test("variável em falta vira string vazia", () => {
  assertEquals(renderTemplate("Olá {{nome}}", {}), "Olá ");
});

Deno.test("aceita espaços dentro das chavetas", () => {
  assertEquals(renderTemplate("Olá {{ nome }}", { nome: "Ana" }), "Olá Ana");
});

Deno.test("converte números e booleanos para texto", () => {
  assertEquals(
    renderTemplate("Valor: {{valor}}, ativo: {{ativo}}", { valor: 42, ativo: true }),
    "Valor: 42, ativo: true",
  );
});

Deno.test("não mexe em texto sem placeholders", () => {
  assertEquals(renderTemplate("Texto simples", {}), "Texto simples");
});

// ── Escape ──────────────────────────────────────────────────────────────────
// O resultado vai para o provider como `html`. Um valor de domínio com markup
// era renderizado como HTML dentro de um email assinado pela organização.

Deno.test("escapa markup vindo de um campo de domínio", () => {
  assertEquals(
    renderTemplate("Cliente: {{nome}}", { nome: '<a href="http://mau.pt">Clique</a>' }),
    "Cliente: &lt;a href=&quot;http://mau.pt&quot;&gt;Clique&lt;/a&gt;",
  );
});

Deno.test("escapa & sem duplicar as entidades já produzidas", () => {
  assertEquals(renderTemplate("{{x}}", { x: "Silva & Filhos <Lda>" }), "Silva &amp; Filhos &lt;Lda&gt;");
});

Deno.test("a forma tripla mantém HTML de confiança intacto (digest)", () => {
  assertEquals(
    renderTemplate("Hoje:<br>{{{lista}}}", { lista: "Aviso A<br>Aviso B" }),
    "Hoje:<br>Aviso A<br>Aviso B",
  );
});

Deno.test("a forma tripla não deixa chavetas soltas", () => {
  assertEquals(renderTemplate("{{{a}}} e {{b}}", { a: "<b>x</b>", b: "<i>y</i>" }), "<b>x</b> e &lt;i&gt;y&lt;/i&gt;");
});

Deno.test("o HTML do próprio template nunca é escapado", () => {
  assertEquals(
    renderTemplate("Erro: {{erro}}<br><br>Ver detalhes.", { erro: "falhou" }),
    "Erro: falhou<br><br>Ver detalhes.",
  );
});
