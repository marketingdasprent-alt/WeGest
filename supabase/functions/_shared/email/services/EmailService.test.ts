import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EmailService } from "./EmailService.ts";
import { EmailProviderFactory } from "../factories/EmailProviderFactory.ts";
import { EmailValidationError } from "../errors/index.ts";
import type { EmailProvider } from "../providers/EmailProvider.ts";
import type { EmailMessage, EmailSendResult } from "../types/index.ts";

const originalGetProvider = EmailProviderFactory.getProvider;

function stubFactory(result: EmailSendResult) {
  const fakeProvider: EmailProvider = { send: async (_msg: EmailMessage) => result };
  EmailProviderFactory.getProvider = async () => ({
    provider: fakeProvider,
    sender: { name: "WeGest", email: "noreply@dasprent.pt" },
  });
}

function restoreFactory() {
  EmailProviderFactory.getProvider = originalGetProvider;
}

function makeMockSupabase(tableRows: Record<string, Record<string, unknown>> = {}) {
  const inserted: Record<string, unknown>[] = [];
  return {
    inserted,
    client: {
      from(table: string) {
        const row = tableRows[table];
        return {
          insert: async (data: Record<string, unknown>) => {
            inserted.push({ ...data, __table: table });
            return { error: null };
          },
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: row ?? null, error: null }) }),
              maybeSingle: async () => ({ data: row ?? null, error: null }),
            }),
          }),
        };
      },
      // deno-lint-ignore no-explicit-any
    } as any,
  };
}

Deno.test("EmailService.sendCalendarNotification envia e regista log de sucesso", async () => {
  stubFactory({ success: true, providerMessageId: "msg-1" });
  const { client, inserted } = makeMockSupabase();

  try {
    const service = new EmailService(client);
    const result = await service.sendCalendarNotification("org-1", {
      to: "gestor@empresa.pt",
      matricula: "AA00AA",
      cidade: "Lisboa",
      tipo: "entrega",
      dataInicio: "2026-07-20T10:00:00Z",
      diaTodo: false,
    });

    assertEquals(result.success, true);
    assertEquals(inserted.length, 1);
    assertEquals(inserted[0].origem, "calendar_notification");
    assertEquals(inserted[0].email, "gestor@empresa.pt");
    assertEquals(inserted[0].status, "sent");
  } finally {
    restoreFactory();
  }
});

Deno.test("EmailService.sendCalendarNotification regista log de erro quando o provider falha", async () => {
  stubFactory({ success: false, error: "Brevo indisponível" });
  const { client, inserted } = makeMockSupabase();

  try {
    const service = new EmailService(client);
    const result = await service.sendCalendarNotification("org-1", {
      to: "gestor@empresa.pt",
      matricula: "AA00AA",
      tipo: "recolha",
      dataInicio: "2026-07-20T10:00:00Z",
    });

    assertEquals(result.success, false);
    assertEquals(inserted[0].status, "erro");
    assertEquals(inserted[0].error_message, "Brevo indisponível");
  } finally {
    restoreFactory();
  }
});

Deno.test("EmailService.sendCalendarNotification rejeita destinatário inválido sem chamar o provider", async () => {
  const { client, inserted } = makeMockSupabase();
  const service = new EmailService(client);

  let threw = false;
  try {
    await service.sendCalendarNotification("org-1", {
      to: "nao-e-email",
      matricula: "AA00AA",
      tipo: "entrega",
      dataInicio: "2026-07-20T10:00:00Z",
    });
  } catch (err) {
    threw = true;
    assertEquals(err instanceof EmailValidationError, true);
  }

  assertEquals(threw, true);
  assertEquals(inserted.length, 0);
});

Deno.test("EmailService.sendDocumentoFiscal usa sempre o sender-padrão da integração da org", async () => {
  let capturedSender: unknown;
  const fakeProvider: EmailProvider = {
    send: async (msg: EmailMessage) => {
      capturedSender = msg.senderOverride;
      return { success: true, providerMessageId: "msg-2" };
    },
  };
  EmailProviderFactory.getProvider = async () => ({
    provider: fakeProvider,
    sender: { name: "WeGest", email: "noreply@dasprent.pt" },
  });

  const { client, inserted } = makeMockSupabase();

  try {
    const service = new EmailService(client);
    const result = await service.sendDocumentoFiscal("org-1", {
      to: "cliente@empresa.pt",
      subject: "Fatura 123",
      mensagem: "Segue em anexo.",
      pdfBase64: "base64==",
      filename: "fatura.pdf",
    });

    assertEquals(result.success, true);
    assertEquals(capturedSender, { name: "WeGest", email: "noreply@dasprent.pt" });
    assertEquals(inserted[0].origem, "documento_fiscal");
  } finally {
    restoreFactory();
  }
});

Deno.test("EmailService.sendFolhaDanos deriva org_id de viaturas quando orgId é null", async () => {
  stubFactory({ success: true });
  const { client } = makeMockSupabase({ viaturas: { org_id: "org-derivada" } });
  let capturedOrgId: unknown;
  EmailProviderFactory.getProvider = async (orgId: string) => {
    capturedOrgId = orgId;
    return {
      provider: { send: async () => ({ success: true }) },
      sender: { name: "WeGest", email: "noreply@dasprent.pt" },
    };
  };

  try {
    const service = new EmailService(client);
    const result = await service.sendFolhaDanos(null, {
      to: "motorista@empresa.pt",
      subject: "Folha de Danos",
      pdfBase64: "base64==",
      filename: "folha.pdf",
      viaturaId: "viatura-1",
    });

    assertEquals(result.success, true);
    assertEquals(capturedOrgId, "org-derivada");
  } finally {
    restoreFactory();
  }
});

Deno.test("EmailService.sendFolhaDanos lança erro sem org_id nem viaturaId", async () => {
  const { client } = makeMockSupabase();
  const service = new EmailService(client);

  let threw = false;
  try {
    await service.sendFolhaDanos(null, {
      to: "motorista@empresa.pt",
      subject: "Folha de Danos",
      pdfBase64: "base64==",
      filename: "folha.pdf",
    });
  } catch (err) {
    threw = true;
    assertEquals(err instanceof EmailValidationError, true);
  }

  assertEquals(threw, true);
});

Deno.test("EmailService.sendReminder inclui CC quando fornecido", async () => {
  let capturedCc: unknown;
  const fakeProvider: EmailProvider = {
    send: async (msg: EmailMessage) => {
      capturedCc = msg.cc;
      return { success: true };
    },
  };
  EmailProviderFactory.getProvider = async () => ({
    provider: fakeProvider,
    sender: { name: "WeGest", email: "noreply@dasprent.pt" },
  });
  const { client } = makeMockSupabase();

  try {
    const service = new EmailService(client);
    await service.sendReminder("org-1", {
      to: "gestor@empresa.pt",
      ccEmail: "supervisor@empresa.pt",
      variant: "dia",
      titulo: "AA00AA",
      tipo: "entrega",
      dataInicio: "2026-07-20T10:00:00Z",
    });

    assertEquals(capturedCc, [{ email: "supervisor@empresa.pt" }]);
  } finally {
    restoreFactory();
  }
});

Deno.test("EmailService.sendMarketing regista campanha_id e nome no log", async () => {
  stubFactory({ success: true, providerMessageId: "msg-3" });
  const { client, inserted } = makeMockSupabase();

  try {
    const service = new EmailService(client);
    await service.sendMarketing("org-1", {
      to: "motorista@empresa.pt",
      toNome: "Motorista Exemplo",
      subject: "Campanha de verão",
      html: "<p>Olá</p>",
      tags: ["campanha_abc12345"],
      campanhaId: "campanha-1",
    });

    assertEquals(inserted[0].origem, "marketing");
    assertEquals(inserted[0].campanha_id, "campanha-1");
    assertEquals(inserted[0].nome, "Motorista Exemplo");
  } finally {
    restoreFactory();
  }
});
