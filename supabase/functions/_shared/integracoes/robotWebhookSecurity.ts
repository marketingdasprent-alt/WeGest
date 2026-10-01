const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function createRobotWebhookSignature(
  integrationId: string,
  serverSecret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(serverSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(integrationId),
  );
  return toHex(new Uint8Array(signature));
}

export async function verifyRobotWebhookSignature(
  integrationId: string,
  receivedSignature: string | null,
  serverSecret: string,
): Promise<boolean> {
  if (!receivedSignature || !/^[a-f0-9]{64}$/i.test(receivedSignature)) {
    return false;
  }

  const expectedSignature = await createRobotWebhookSignature(
    integrationId,
    serverSecret,
  );
  return constantTimeEqual(receivedSignature.toLowerCase(), expectedSignature);
}
