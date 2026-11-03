import { assertEquals } from 'jsr:@std/assert@1.0.19';

import { sincronizarTodas } from './sincronizarTodas.ts';

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

/** Pedido que só termina quando o sinal aborta, como uma Cartrack pendurada. */
const pendurado = (_id: string, sinal: AbortSignal) =>
  new Promise<Response>((_resolve, reject) => {
    sinal.addEventListener('abort', () => reject(sinal.reason));
  });

Deno.test('as integrações correm em paralelo: o total é o da mais lenta, não a soma', async () => {
  const inicio = Date.now();
  const r = await sincronizarTodas(
    [
      { id: 'a', nome: 'A' },
      { id: 'b', nome: 'B' },
      { id: 'c', nome: 'C' },
    ],
    () => new Promise((ok) => setTimeout(() => ok(resposta({ success: true })), 100))
  );
  assertEquals(r.every((x) => x.ok), true);
  assertEquals(Date.now() - inicio < 280, true);
});

Deno.test('uma integração pendurada falha no prazo e não trava as outras', async () => {
  const r = await sincronizarTodas(
    [
      { id: 'lenta', nome: 'Lenta' },
      { id: 'boa', nome: 'Boa' },
    ],
    (id, sinal) =>
      id === 'lenta'
        ? pendurado(id, sinal)
        : Promise.resolve(resposta({ success: true, vehicles: { upserted: 12 } })),
    50
  );
  assertEquals(r[0], {
    integracao_id: 'lenta',
    nome: 'Lenta',
    ok: false,
    vehicles: null,
    error: 'Sem resposta em 0 s',
  });
  assertEquals(r[1].ok, true);
  assertEquals(r[1].vehicles, 12);
});

Deno.test('erro devolvido pela sync fica no resultado', async () => {
  const r = await sincronizarTodas([{ id: 'x', nome: null }], () =>
    Promise.resolve(resposta({ success: false, error: 'Credenciais inválidas' }, 400))
  );
  assertEquals(r[0].ok, false);
  assertEquals(r[0].error, 'Credenciais inválidas');
});
