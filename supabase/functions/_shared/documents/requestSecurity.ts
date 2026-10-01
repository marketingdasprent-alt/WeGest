const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 1024 * 1024;
const MAX_SIGNATORIES = 10;

function estimatedBase64Bytes(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

function assertBase64(value: string): void {
  if (
    !value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  ) {
    throw new Error("Anexo base64 inválido");
  }
}

export function validateDocumentAttachments(
  attachments: Array<{ content: string; name: string }>,
): void {
  if (attachments.length === 0 || attachments.length > MAX_ATTACHMENTS) {
    throw new Error(`Máximo de ${MAX_ATTACHMENTS} anexos por envio`);
  }

  let total = 0;
  for (const attachment of attachments) {
    if (!attachment.name || attachment.name.length > 180) {
      throw new Error("Nome de anexo inválido");
    }
    assertBase64(attachment.content);
    const bytes = estimatedBase64Bytes(attachment.content);
    if (bytes > MAX_ATTACHMENT_BYTES) throw new Error("Anexo excede 15 MiB");
    total += bytes;
  }
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error("Anexos excedem 25 MiB no total");
  }
}

export function validateSignatureRequestLimits(input: {
  pdfBase64: string;
  snapshot: unknown;
  signatarios: unknown[];
  validadeDias: number;
}): void {
  validateDocumentAttachments([{
    content: input.pdfBase64,
    name: "documento.pdf",
  }]);
  if (
    input.signatarios.length === 0 || input.signatarios.length > MAX_SIGNATORIES
  ) {
    throw new Error(`Máximo de ${MAX_SIGNATORIES} signatários por documento`);
  }
  if (
    !Number.isInteger(input.validadeDias) || input.validadeDias < 1 ||
    input.validadeDias > 3650
  ) {
    throw new Error("Validade deve estar entre 1 e 3650 dias");
  }
  if (
    new TextEncoder().encode(JSON.stringify(input.snapshot)).byteLength >
      MAX_SNAPSHOT_BYTES
  ) {
    throw new Error("Fotografia do documento excede 1 MiB");
  }
}
