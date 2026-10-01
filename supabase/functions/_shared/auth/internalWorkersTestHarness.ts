import { assert } from 'jsr:@std/assert@1.0.19';
import { stub } from 'jsr:@std/testing@1.0.16/mock';

export const INTERNAL_KEY = 'internal-worker-test-key';

export async function loadWorker(name: string) {
  const serving = stub(Deno, 'serve');
  try {
    await import(new URL(`../../${name}/index.ts`, import.meta.url).href);
    const handler: unknown = serving.calls[0]?.args[0];
    assert(typeof handler === 'function');
    return async (req: Request): Promise<Response> => {
      const response: unknown = await handler(req, {
        remoteAddr: { transport: 'tcp', hostname: '127.0.0.1', port: 8080 },
        completed: Promise.resolve(),
      });
      assert(response instanceof Response);
      return response;
    };
  } finally {
    serving.restore();
  }
}

export async function withWorkerEnvironment(
  run: () => Promise<void>,
  fetcher: typeof fetch = () => Promise.resolve(Response.json([]))
) {
  const values = {
    SUPABASE_URL: 'https://worker-test.invalid',
    SUPABASE_SERVICE_ROLE_KEY: INTERNAL_KEY,
    BREVO_API_KEY: 'brevo-worker-test-key',
  };
  const previous = new Map(Object.keys(values).map((key) => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
  const fetching = stub(globalThis, 'fetch', fetcher);
  try {
    await run();
  } finally {
    fetching.restore();
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

export function internalRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://worker-test.invalid', {
    method,
    headers: { Authorization: `Bearer ${INTERNAL_KEY}`, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}

export const settlement = {
  driver_name: 'Motorista teste',
  email: 'motorista@example.test',
  total_faturado: 500,
  faturado_bolt: 300,
  faturado_uber: 200,
  liquido: 350,
  aluguer: 150,
  periodo: '14/09 a 20/09/2026',
};
