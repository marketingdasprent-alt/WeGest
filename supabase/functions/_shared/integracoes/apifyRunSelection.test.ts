import { assertEquals } from "jsr:@std/assert@1";

import { findLatestRunForIntegration } from "./apifyRunSelection.ts";

Deno.test("resgate ignora a run mais recente de outra integração", async () => {
  const runs = [
    {
      id: "run-b",
      defaultDatasetId: "dataset-b",
      startedAt: "2026-09-11T10:00:00Z",
    },
    {
      id: "run-a",
      defaultDatasetId: "dataset-a",
      startedAt: "2026-09-11T09:00:00Z",
    },
  ];
  const inputs = new Map<string, unknown>([
    ["run-b", { integracaoId: "integracao-b" }],
    ["run-a", { integracaoId: "integracao-a" }],
  ]);

  const selected = await findLatestRunForIntegration(
    runs,
    "integracao-a",
    (runId) => Promise.resolve(inputs.get(runId)),
  );

  assertEquals(selected?.id, "run-a");
});

Deno.test("resgate não usa runs sem identidade comprovada", async () => {
  const selected = await findLatestRunForIntegration(
    [{
      id: "run-sem-input",
      defaultDatasetId: "dataset",
      startedAt: "2026-09-11T10:00:00Z",
    }],
    "integracao-a",
    () => Promise.resolve({}),
  );

  assertEquals(selected, null);
});
