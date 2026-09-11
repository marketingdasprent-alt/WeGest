import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  validateDocumentAttachments,
  validateSignatureRequestLimits,
} from "./requestSecurity.ts";

Deno.test("document attachments rejeitam mais de 5 anexos", () => {
  assertThrows(
    () =>
      validateDocumentAttachments(
        Array.from(
          { length: 6 },
          (_, i) => ({ name: `${i}.pdf`, content: "QQ==" }),
        ),
      ),
    Error,
    "Máximo de 5 anexos",
  );
});

Deno.test("signature request rejeita PDF acima do limite antes de descodificar", () => {
  assertThrows(
    () =>
      validateSignatureRequestLimits({
        pdfBase64: "A".repeat(21 * 1024 * 1024),
        snapshot: {},
        signatarios: [{}],
        validadeDias: 30,
      }),
    Error,
    "Anexo excede",
  );
});

Deno.test("signature request aceita limites normais", () => {
  validateSignatureRequestLimits({
    pdfBase64: "JVBERi0xLjQ=",
    snapshot: { contrato: "123" },
    signatarios: [{}],
    validadeDias: 30,
  });
  assertEquals(true, true);
});
