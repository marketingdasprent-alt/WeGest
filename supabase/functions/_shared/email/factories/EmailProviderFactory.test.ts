import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EmailProviderFactory } from "./EmailProviderFactory.ts";
import { EmailConfigError } from "../errors/index.ts";
import { BrevoProvider } from "../providers/BrevoProvider.ts";

// deno-lint-ignore no-explicit-any
function makeMockSupabase(opts: {
  configRow?: Record<string, unknown> | null;
  configError?: { message: string };
  apiKey?: string | null;
  rpcError?: { message: string };
}) {
  return {
    from(_table: string) {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: opts.configRow ?? null,
                  error: opts.configError ?? null,
                }),
              }),
            }),
          }),
        }),
      };
    },
    rpc: async (_name: string, _args: unknown) => ({
      data: opts.apiKey ?? null,
      error: opts.rpcError ?? null,
    }),
    // deno-lint-ignore no-explicit-any
  } as any;
}

const originalEnvGet = Deno.env.get;

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  Deno.env.get = (key: string) => vars[key] ?? originalEnvGet(key);
  return fn().finally(() => {
    Deno.env.get = originalEnvGet;
  });
}

Deno.test("EmailProviderFactory.getProvider instancia BrevoProvider quando a org tem integração activa", async () => {
  const supabase = makeMockSupabase({
    configRow: {
      id: "int-1",
      org_id: "org-1",
      email_provider: "brevo",
      email_sender_name: "Empresa X",
      email_sender_email: "org@empresa-x.pt",
      email_reply_to: null,
      ativo: true,
    },
    apiKey: "decrypted-key-123",
  });

  const resolved = await EmailProviderFactory.getProvider("org-1", supabase);

  assertEquals(resolved.provider instanceof BrevoProvider, true);
  assertEquals(resolved.sender.email, "org@empresa-x.pt");
});

Deno.test("EmailProviderFactory.getProvider lança EmailConfigError se email_provider for desconhecido", async () => {
  const supabase = makeMockSupabase({
    configRow: { id: "int-2", org_id: "org-1", email_provider: "mailgun", ativo: true },
  });

  await assertRejects(
    () => EmailProviderFactory.getProvider("org-1", supabase),
    EmailConfigError
  );
});

Deno.test("EmailProviderFactory.getProvider lança EmailConfigError se a API key não decifrar", async () => {
  const supabase = makeMockSupabase({
    configRow: { id: "int-3", org_id: "org-1", email_provider: "brevo", ativo: true },
    apiKey: null,
  });

  await assertRejects(
    () => EmailProviderFactory.getProvider("org-1", supabase),
    EmailConfigError
  );
});

Deno.test("EmailProviderFactory.getProvider cai no fallback legado quando não há integração e BREVO_API_KEY existe", async () => {
  const supabase = makeMockSupabase({ configRow: null });

  await withEnv({ BREVO_API_KEY: "legacy-key" }, async () => {
    const resolved = await EmailProviderFactory.getProvider("org-sem-integracao", supabase);
    assertEquals(resolved.provider instanceof BrevoProvider, true);
    assertEquals(resolved.sender.email, "noreply@dasprent.pt");
  });
});

Deno.test("EmailProviderFactory.getProvider lança EmailConfigError sem integração e sem fallback", async () => {
  const supabase = makeMockSupabase({ configRow: null });

  await withEnv({ BREVO_API_KEY: undefined }, async () => {
    await assertRejects(
      () => EmailProviderFactory.getProvider("org-sem-integracao", supabase),
      EmailConfigError
    );
  });
});
