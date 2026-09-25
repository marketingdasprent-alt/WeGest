import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { readBoundedJson, RequestBodyError } from './boundedJson.ts';

Deno.test('conta bytes reais mesmo com content-length menor', async () => {
  const req = new Request('https://worker-test.invalid', {
    method: 'POST',
    headers: { 'Content-Length': '1' },
    body: JSON.stringify({ texto: 'áá' }),
  });

  const error = await assertRejects(() => readBoundedJson(req, 10), RequestBodyError);

  assertEquals(error.status, 413);
});

Deno.test('descodifica UTF-8 dividido entre chunks', async () => {
  const encoded = new TextEncoder().encode('{"texto":"á"}');
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded.slice(0, 11));
      controller.enqueue(encoded.slice(11));
      controller.close();
    },
  });
  const req = new Request('https://worker-test.invalid', { method: 'POST', body });

  const value = await readBoundedJson(req, encoded.length);

  assertEquals(value, { texto: 'á' });
});

Deno.test('recusa JSON malformado com erro400', async () => {
  const req = new Request('https://worker-test.invalid', { method: 'POST', body: '{' });

  const error = await assertRejects(() => readBoundedJson(req, 10), RequestBodyError);

  assertEquals(error.status, 400);
});

Deno.test('aceita corpo ausente quando o cron usa valores por omissão', async () => {
  const req = new Request('https://worker-test.invalid', { method: 'POST' });

  const value = await readBoundedJson(req, 10, true);

  assertEquals(value, {});
});
