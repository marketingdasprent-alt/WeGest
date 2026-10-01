export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 = 400
  ) {
    super(message);
    this.name = 'RequestBodyError';
  }
}

export async function readBoundedJson(
  req: Request,
  maxBytes: number,
  allowEmpty = false
): Promise<unknown> {
  if (Number(req.headers.get('content-length')) > maxBytes) {
    throw new RequestBodyError('Corpo do pedido demasiado grande', 413);
  }
  const reader = req.body?.getReader();
  if (!reader) {
    if (allowEmpty) return {};
    throw new RequestBodyError('Corpo JSON obrigatório');
  }
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError('Corpo do pedido demasiado grande', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  if (allowEmpty && !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (error: unknown) {
    if (error instanceof SyntaxError) throw new RequestBodyError('JSON inválido');
    throw error;
  }
}
