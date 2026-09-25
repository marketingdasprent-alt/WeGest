import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1.0.19';
import {
  internalRequest,
  loadWorker,
  settlement,
  withWorkerEnvironment,
} from './internalWorkersTestHarness.ts';

const bulk = await loadWorker('send-bulk-settlements');
const weekly = await loadWorker('send-weekly-settlements');
const viaVerde = await loadWorker('via-verde-import');
const integracaoId = '22222222-2222-4222-8222-222222222222';

for (const [name, body, status] of [
  ['lote vazio', { settlements: [] }, 400],
  ['lista em falta', { acertos: [settlement] }, 400],
  ['lote de 101', { settlements: Array.from({ length: 101 }, () => settlement) }, 400],
  ['corpo excessivo', { settlements: [settlement], extra: 'x'.repeat(256 * 1024) }, 413],
] as const) {
  Deno.test(`bulk recusa ${name} antes de enviar email`, async () => {
    let calls = 0;
    await withWorkerEnvironment(
      async () => {
        const response = await bulk(internalRequest(body));

        assertEquals(response.status, status);
        assertEquals(calls, 0);
      },
      () => {
        calls++;
        return Promise.resolve(Response.json({ messageId: 'test' }));
      }
    );
  });
}

// Um acerto mau não pode travar o lote: antes só falhava essa linha, e o
// weekly parava a meio e reenviava os lotes já enviados ao voltar a correr.
Deno.test('bulk envia os acertos válidos e marca os inválidos como falhados', async () => {
  let calls = 0;
  await withWorkerEnvironment(
    async () => {
      const response = await bulk(
        internalRequest({
          settlements: [
            settlement,
            { ...settlement, email: 'joão@exemplo' },
            { ...settlement, email: 'outro@example.test', liquido: '500' },
          ],
        })
      );

      assertEquals(response.status, 200);
      assertEquals(calls, 1);
      const body = await response.json();
      assertEquals(
        body.results.map((r: { success: boolean }) => r.success),
        [true, false, false]
      );
      assertStringIncludes(body.results[1].error, 'email');
      assertStringIncludes(body.results[2].error, 'liquido');
    },
    () => {
      calls++;
      return Promise.resolve(Response.json({ messageId: 'test' }));
    }
  );
});

Deno.test('bulk escapa nome e período no HTML sem alterar destinatário', async () => {
  let sent: unknown;
  await withWorkerEnvironment(
    async () => {
      const response = await bulk(
        internalRequest({
          settlements: [
            {
              ...settlement,
              driver_name: '<img src=x onerror="x">',
              periodo: '<a href="x">& semana</a>',
            },
          ],
        })
      );

      assertEquals(response.status, 200);
      assert(typeof sent === 'object' && sent !== null && 'htmlContent' in sent);
      assert(typeof sent.htmlContent === 'string');
      assertStringIncludes(sent.htmlContent, '&lt;img src=x onerror=&quot;x&quot;&gt;');
      assertStringIncludes(sent.htmlContent, '&lt;a href=&quot;x&quot;&gt;&amp; semana&lt;/a&gt;');
      assert(!sent.htmlContent.includes('<img src=x'));
    },
    (_input, init) => {
      assert(typeof init?.body === 'string');
      sent = JSON.parse(init.body);
      return Promise.resolve(Response.json({ messageId: 'test' }));
    }
  );
});

// A mensagem vai para via_verde_sync_queue.error_message: tem de apontar o
// campo que falhou, não o limite de linhas para qualquer erro.
for (const [name, body, esperado, ausente] of [
  ['UUID inválido', { integracao_id: 'invalid', transacoes: [] }, 'integracao_id', '10000'],
  [
    'mais de 10000 transações',
    { integracao_id: integracaoId, transacoes: Array.from({ length: 10001 }, () => ({})) },
    'máximo 10000',
    'integracao_id',
  ],
] as const) {
  Deno.test(`Via Verde explica a recusa por ${name}`, async () => {
    await withWorkerEnvironment(async () => {
      const response = await viaVerde(internalRequest(body));
      const { error } = await response.json();

      assertEquals(response.status, 400);
      assertStringIncludes(error, esperado);
      assert(!error.includes(ausente));
    });
  });
}

for (const [name, body, status] of [
  ['UUID inválido', { integracao_id: 'invalid', transacoes: [] }, 400],
  ['transações sem array', { integracao_id: integracaoId, transacoes: {} }, 400],
  [
    'mais de 10000 transações',
    { integracao_id: integracaoId, transacoes: Array.from({ length: 10001 }, () => ({})) },
    400,
  ],
  [
    'mais de 10000 linhas CSV',
    { integracao_id: integracaoId, dados_csv: 'Matricula;Valor\n' + 'AA;1\n'.repeat(10001) },
    400,
  ],
  [
    'corpo excessivo',
    { integracao_id: integracaoId, dados_csv: 'x'.repeat(10 * 1024 * 1024) },
    413,
  ],
] as const) {
  Deno.test(`Via Verde recusa ${name} antes de consultar a BD`, async () => {
    let calls = 0;
    await withWorkerEnvironment(
      async () => {
        const response = await viaVerde(internalRequest(body));

        assertEquals(response.status, status);
        assertEquals(calls, 0);
      },
      () => {
        calls++;
        return Promise.resolve(Response.json([]));
      }
    );
  });
}

for (const body of [
  { semanaInicio: '2026-09-31', semanaFim: '2026-10-06' },
  { semanaInicio: '2026-09-21', semanaFim: '2026-09-20' },
  { semanaInicio: '2026-01-01', semanaFim: '2026-09-20' },
]) {
  Deno.test(`weekly recusa período inválido ${JSON.stringify(body)}`, async () => {
    let calls = 0;
    await withWorkerEnvironment(
      async () => {
        const response = await weekly(internalRequest(body));

        assertEquals(response.status, 400);
        assertEquals(calls, 0);
      },
      () => {
        calls++;
        return Promise.resolve(Response.json([]));
      }
    );
  });
}

Deno.test('weekly envia 201 acertos em lotes e responde apenas com contagens', async () => {
  const sizes: number[] = [];
  const drivers = Array.from({ length: 201 }, (_, id) => ({
    id: String(id),
    nome: 'Motorista',
    email: `test${id}@example.test`,
  }));
  const rows = drivers.map((driver) => ({
    motorista_id: driver.id,
    custo_aluguer: 100,
    receita_bolt: 300,
    receita_uber: 0,
    receita_outras: 0,
    despesa_caucao: 0,
    despesa_seguros: 0,
    despesa_outros: 0,
  }));
  await withWorkerEnvironment(
    async () => {
      const response = await weekly(
        internalRequest({ semanaInicio: '2026-09-14', semanaFim: '2026-09-20' })
      );
      const body: unknown = await response.json();

      assertEquals(response.status, 200);
      assertEquals(sizes, [100, 100, 1]);
      assertEquals(body, {
        success: true,
        semanaInicio: '2026-09-14',
        semanaFim: '2026-09-20',
        enviados: 201,
        falhados: 0,
      });
    },
    (input, init) => {
      const url = String(input);
      if (url.includes('send-bulk-settlements')) {
        assert(typeof init?.body === 'string');
        const payload: unknown = JSON.parse(init.body);
        assert(
          typeof payload === 'object' &&
            payload !== null &&
            'settlements' in payload &&
            Array.isArray(payload.settlements)
        );
        sizes.push(payload.settlements.length);
        return Promise.resolve(
          Response.json({
            results: payload.settlements.map(() => ({
              success: true,
              email: 'private@example.test',
            })),
          })
        );
      }
      if (url.includes('motorista_resumo_semanal')) return Promise.resolve(Response.json(rows));
      if (url.includes('motoristas_ativos')) return Promise.resolve(Response.json(drivers));
      if (url.includes('motorista_liquido_semanal'))
        return Promise.resolve(
          Response.json(drivers.map((d) => ({ motorista_id: d.id, liquido: 200 })))
        );
      throw new Error(`Pedido inesperado no teste: ${url}`);
    }
  );
});
