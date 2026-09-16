import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolverEmissorDoEmail } from "./emissor.ts";

// Mock mínimo do cliente Supabase: `from(tabela).select(...).eq(...).maybeSingle()`
// devolve a linha registada para essa tabela (ou null). Regista as tabelas
// consultadas para se poder afirmar que a org só é lida quando é preciso.
function mockSupabase(rows: Record<string, Record<string, unknown> | null>) {
  const consultadas: string[] = [];
  const client = {
    from(tabela: string) {
      consultadas.push(tabela);
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: rows[tabela] ?? null, error: null }),
      };
      return chain;
    },
  };
  return { client, consultadas };
}

const ORG = { nome: "Década Ousada", logo_url: "https://x/decada.png" };

Deno.test("cobrança de contrato: a marca é a da empresa emissora do contrato, não a da org", async () => {
  const { client, consultadas } = mockSupabase({
    contrato_cobrancas: { contrato_id: "ctr-1", reserva_id: null },
    contratos_renting: { emissor_id: "emp-1" },
    clientes: { nome: "Dasp Rent Sul, Lda", nome_comercial: "Dasp Rent Sul", logo_url: "https://x/dasp.png" },
    organizacoes: ORG,
  });

  const r = await resolverEmissorDoEmail(client as never, { orgId: "org-1", cobrancaId: "cob-1" });

  assertEquals(r, { emissorNome: "Dasp Rent Sul", emissorLogoUrl: "https://x/dasp.png" });
  assertEquals(consultadas.includes("organizacoes"), false);
});

Deno.test("sem nome comercial usa o nome fiscal da emissora", async () => {
  const { client } = mockSupabase({
    contratos_renting: { emissor_id: "emp-1" },
    clientes: { nome: "Urbango, Lda", nome_comercial: "", logo_url: null },
    organizacoes: ORG,
  });

  const r = await resolverEmissorDoEmail(client as never, { orgId: "org-1", contratoId: "ctr-1" });

  assertEquals(r, { emissorNome: "Urbango, Lda", emissorLogoUrl: null });
});

Deno.test("cobrança de reserva (sem contrato) resolve pela emissora da reserva", async () => {
  const { client } = mockSupabase({
    contrato_cobrancas: { contrato_id: null, reserva_id: "res-1" },
    reservas: { emissor_id: "emp-2" },
    clientes: { nome: "Distância Arrojada", nome_comercial: null, logo_url: "https://x/dist.png" },
    organizacoes: ORG,
  });

  const r = await resolverEmissorDoEmail(client as never, { orgId: "org-1", cobrancaId: "cob-2" });

  assertEquals(r, { emissorNome: "Distância Arrojada", emissorLogoUrl: "https://x/dist.png" });
});

Deno.test("contrato sem emissora cai para a marca da organização", async () => {
  const { client } = mockSupabase({
    contratos_renting: { emissor_id: null },
    organizacoes: ORG,
  });

  const r = await resolverEmissorDoEmail(client as never, { orgId: "org-1", contratoId: "ctr-1" });

  assertEquals(r, { emissorNome: "Década Ousada", emissorLogoUrl: "https://x/decada.png" });
});

Deno.test("sem nada resolvível devolve undefined — o template fica white-label WeGest", async () => {
  const { client } = mockSupabase({ organizacoes: null });

  const r = await resolverEmissorDoEmail(client as never, { orgId: "org-1" });

  assertEquals(r, { emissorNome: undefined, emissorLogoUrl: undefined });
});
