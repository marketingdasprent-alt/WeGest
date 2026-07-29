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
