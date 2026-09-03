import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSettlements } from "./buildSettlements.ts";

/** Líquido gravado pelo resumo do motorista — a única fonte do total. */
const liquidos = (entradas: Record<string, number>) =>
  new Map<string, number>(Object.entries(entradas));

Deno.test("agrega um único segmento por motorista", () => {
  const settlements = buildSettlements(
    [
      {
        motorista_id: "m1",
        custo_aluguer: 100,
        receita_bolt: 300,
        receita_uber: 200,
        receita_outras: 0,
        despesa_caucao: 0,
        despesa_seguros: 0,
        despesa_outros: 0,
      },
    ],
    [{ id: "m1", nome: "João Silva", email: "joao@teste.pt" }],
    "01/01 a 07/01",
    liquidos({ m1: 372.55 }),
  );

  assertEquals(settlements, [
    {
      driver_name: "João Silva",
      email: "joao@teste.pt",
      total_faturado: 500,
      faturado_bolt: 300,
      faturado_uber: 200,
      liquido: 372.55,
      aluguer: 100,
      outros_custos: 0,
      periodo: "01/01 a 07/01",
    },
  ]);
});

Deno.test("soma vários segmentos do mesmo motorista na mesma semana (troca de viatura a meio)", () => {
  const settlements = buildSettlements(
    [
      { motorista_id: "m1", custo_aluguer: 50, receita_bolt: 100, receita_uber: 0, receita_outras: 0, despesa_caucao: 0, despesa_seguros: 0, despesa_outros: 0 },
      { motorista_id: "m1", custo_aluguer: 60, receita_bolt: 150, receita_uber: 0, receita_outras: 0, despesa_caucao: 0, despesa_seguros: 0, despesa_outros: 0 },
    ],
    [{ id: "m1", nome: "João Silva", email: "joao@teste.pt" }],
    "01/01 a 07/01",
    liquidos({ m1: 90 }),
  );

  assertEquals(settlements.length, 1);
  assertEquals(settlements[0].aluguer, 110);
  assertEquals(settlements[0].faturado_bolt, 250);
});

Deno.test("caução, seguros e despesas outras entram todas em outros_custos", () => {
  const settlements = buildSettlements(
    [
      {
        motorista_id: "m1",
        custo_aluguer: 100,
        receita_bolt: 500,
        receita_uber: 0,
        receita_outras: 0,
        despesa_caucao: 20,
        despesa_seguros: 15,
        despesa_outros: 5,
      },
    ],
    [{ id: "m1", nome: "João Silva", email: "joao@teste.pt" }],
    "01/01 a 07/01",
    liquidos({ m1: 360 }),
  );

  assertEquals(settlements[0].outros_custos, 40);
});

// O total do email é o do resumo, não uma conta feita aqui. Esta função
// chegou a calcular `faturado − aluguer − outros`, sem os 6% do recibo
// verde nem combustível/portagens/reparações — um terceiro número, enviado
// ao próprio motorista.
Deno.test("o líquido é o do resumo, não o que sairia das linhas de custo", () => {
  const settlements = buildSettlements(
    [{ motorista_id: "m1", custo_aluguer: 100, receita_bolt: 500, receita_uber: 0, receita_outras: 0, despesa_caucao: 0, despesa_seguros: 0, despesa_outros: 0 }],
    [{ id: "m1", nome: "João Silva", email: "joao@teste.pt" }],
    "01/01 a 07/01",
    liquidos({ m1: 271.7 }),
  );

  // A conta antiga daria 400. O resumo disse 271,70 — vale o resumo.
  assertEquals(settlements[0].liquido, 271.7);
});

Deno.test("motorista sem líquido gravado não leva email (ninguém abriu o resumo dele)", () => {
  const settlements = buildSettlements(
    [{ motorista_id: "m1", custo_aluguer: 0, receita_bolt: 100, receita_uber: 0, receita_outras: 0, despesa_caucao: 0, despesa_seguros: 0, despesa_outros: 0 }],
    [{ id: "m1", nome: "João Silva", email: "joao@teste.pt" }],
    "01/01 a 07/01",
    liquidos({}),
  );

  assertEquals(settlements, []);
});

Deno.test("um líquido de zero é um valor, não uma ausência", () => {
  const settlements = buildSettlements(
    [{ motorista_id: "m1", custo_aluguer: 100, receita_bolt: 100, receita_uber: 0, receita_outras: 0, despesa_caucao: 0, despesa_seguros: 0, despesa_outros: 0 }],
    [{ id: "m1", nome: "João Silva", email: "joao@teste.pt" }],
    "01/01 a 07/01",
    liquidos({ m1: 0 }),
  );

  assertEquals(settlements.length, 1);
  assertEquals(settlements[0].liquido, 0);
});

Deno.test("não inclui combustivel nem reparacoes (não são agregados por motorista_resumo_semanal)", () => {
  const settlements = buildSettlements(
    [{ motorista_id: "m1", custo_aluguer: 0, receita_bolt: 100, receita_uber: 0, receita_outras: 0, despesa_caucao: 0, despesa_seguros: 0, despesa_outros: 0 }],
    [{ id: "m1", nome: "João Silva", email: "joao@teste.pt" }],
    "01/01 a 07/01",
    liquidos({ m1: 100 }),
  );

  assertEquals("combustivel" in settlements[0], false);
  assertEquals("reparacoes" in settlements[0], false);
});

Deno.test("motorista sem email cadastrado é excluído (send-bulk-settlements não teria para onde enviar)", () => {
  const settlements = buildSettlements(
    [{ motorista_id: "m1", custo_aluguer: 0, receita_bolt: 100, receita_uber: 0, receita_outras: 0, despesa_caucao: 0, despesa_seguros: 0, despesa_outros: 0 }],
    [{ id: "m1", nome: "João Silva", email: null }],
    "01/01 a 07/01",
    liquidos({ m1: 100 }),
  );

  assertEquals(settlements, []);
});

Deno.test("arredonda a 2 casas decimais", () => {
  // Valores longe da fronteira exata .xx5 (evita fragilidade de vírgula
  // flutuante binária nesse limite específico de arredondamento).
  const settlements = buildSettlements(
    [
      { motorista_id: "m1", custo_aluguer: 33.334, receita_bolt: 100.006, receita_uber: 0, receita_outras: 0, despesa_caucao: 0, despesa_seguros: 0, despesa_outros: 0 },
    ],
    [{ id: "m1", nome: "João Silva", email: "joao@teste.pt" }],
    "01/01 a 07/01",
    liquidos({ m1: 66.672 }),
  );

  assertEquals(settlements[0].faturado_bolt, 100.01);
  assertEquals(settlements[0].aluguer, 33.33);
  assertEquals(settlements[0].liquido, 66.67);
});
