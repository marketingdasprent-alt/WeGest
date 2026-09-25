import { assertEquals } from 'jsr:@std/assert@1.0.19';
import {
  internalRequest,
  loadWorker,
  settlement,
  withWorkerEnvironment,
} from './internalWorkersTestHarness.ts';

const workers = [
  'via-verde-import',
  'via-verde-sync-drain',
  'send-bulk-settlements',
  'send-weekly-settlements',
] as const;

for (const worker of workers) {
  const handler = await loadWorker(worker);
  for (const token of [undefined, 'anon-test-token', 'user-test-token']) {
    Deno.test(`${worker} recusa token ${token ?? 'ausente'} antes de efeitos`, async () => {
      let outgoing = 0;
      await withWorkerEnvironment(
        async () => {
          Deno.env.delete('SUPABASE_URL');
          Deno.env.delete('BREVO_API_KEY');
          const req = new Request('https://worker-test.invalid', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: '{json inválido',
          });

          const response = await handler(req);

          assertEquals(response.status, 401);
          assertEquals(outgoing, 0);
        },
        () => {
          outgoing++;
          return Promise.resolve(Response.json([]));
        }
      );
    });
  }

  Deno.test(`${worker} aceita preflight sem credenciais`, async () => {
    const response = await handler(
      new Request('https://worker-test.invalid', { method: 'OPTIONS' })
    );

    assertEquals(response.status, 200);
  });

  Deno.test(`${worker} recusa GET interno`, async () => {
    await withWorkerEnvironment(async () => {
      const response = await handler(internalRequest(undefined, 'GET'));

      assertEquals(response.status, 405);
    });
  });

  Deno.test(`${worker} aceita chamada interna válida`, async () => {
    const bodies = {
      'via-verde-import': { integracao_id: '22222222-2222-4222-8222-222222222222', transacoes: [] },
      'via-verde-sync-drain': {},
      'send-bulk-settlements': { settlements: [settlement] },
      'send-weekly-settlements': {},
    };
    await withWorkerEnvironment(
      async () => {
        const response = await handler(internalRequest(bodies[worker]));

        assertEquals(response.status, 200);
      },
      (input) =>
        Promise.resolve(
          Response.json(
            String(input).includes('plataformas_configuracao')
              ? { org_id: 'org-teste', nome: 'Via Verde' }
              : []
          )
        )
    );
  });
}
