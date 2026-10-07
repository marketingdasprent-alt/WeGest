import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { BUCKET_FOTOS, preencherFotos, VALIDADE_FOTO_SEGUNDOS } from './fotos.ts';

type Item = { path: string | null; signedUrl: string | null; error: string | null };
type Resposta = { data: Item[] | null; error: unknown };
type Cartao = Record<string, unknown>;

function armazem(responder: (caminhos: string[]) => Resposta | Promise<Resposta>) {
  const chamadas: { bucket: string; caminhos: string[]; validade: number }[] = [];
  const db = {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrls(caminhos: string[], validade: number) {
            chamadas.push({ bucket, caminhos, validade });
            return await responder(caminhos);
          },
        };
      },
    },
  };
  return { db, chamadas };
}

const assinaTudo = (caminhos: string[]): Resposta => ({
  data: caminhos.map((p) => ({ path: p, signedUrl: `https://s/${p}?token=t`, error: null })),
  error: null,
});

/** Corre fn com console.error apanhado; devolve o que foi escrito. */
async function comLogs(fn: () => Promise<void>): Promise<unknown[][]> {
  const original = console.error;
  const logs: unknown[][] = [];
  console.error = (...a: unknown[]) => logs.push(a);
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return logs;
}

Deno.test('assina os caminhos únicos de uma vez, no bucket certo, por 24 h', async () => {
  const { db, chamadas } = armazem(assinaTudo);
  const cartoes: Cartao[] = [
    { id: 'm1', imagem_url: null, foto_path: 'v1/fotos/a' },
    { id: 'm2', imagem_url: null, foto_path: 'v1/fotos/a' },
    { id: 'm3', imagem_url: null, foto_path: 'v2/fotos/b' },
  ];
  await preencherFotos(cartoes, db);
  assertEquals(chamadas, [
    { bucket: BUCKET_FOTOS, caminhos: ['v1/fotos/a', 'v2/fotos/b'], validade: 86400 },
  ]);
  assertEquals(VALIDADE_FOTO_SEGUNDOS, 24 * 60 * 60);
  assertEquals(cartoes, [
    { id: 'm1', imagem_url: 'https://s/v1/fotos/a?token=t' },
    { id: 'm2', imagem_url: 'https://s/v1/fotos/a?token=t' },
    { id: 'm3', imagem_url: 'https://s/v2/fotos/b?token=t' },
  ]);
});

Deno.test('modelo sem foto sai com imagem_url null e sem foto_path', async () => {
  const { db, chamadas } = armazem(assinaTudo);
  const cartoes: Cartao[] = [
    { id: 'm1', imagem_url: null, foto_path: null },
    { id: 'm2', imagem_url: null, foto_path: 'v1/fotos/a' },
  ];
  await preencherFotos(cartoes, db);
  assertEquals(cartoes[0], { id: 'm1', imagem_url: null });
  assertEquals(chamadas[0].caminhos, ['v1/fotos/a']);
});

Deno.test('a foto de marketing nunca passa: imagem_url vem só da viatura', async () => {
  const { db, chamadas } = armazem(assinaTudo);
  const cartao: Cartao = { id: 'm1', imagem_url: 'https://marketing/clio.webp' };
  await preencherFotos(cartao, db);
  assertEquals(cartao, { id: 'm1', imagem_url: null });
  assertEquals(chamadas.length, 0, 'sem caminhos não vai ao storage');
});

Deno.test('aceita um só cartão (detalhe do modelo)', async () => {
  const { db } = armazem(assinaTudo);
  const cartao: Cartao = { id: 'm1', tarifa: {}, imagem_url: null, foto_path: 'v1/fotos/a' };
  await preencherFotos(cartao, db);
  assertEquals(cartao, { id: 'm1', tarifa: {}, imagem_url: 'https://s/v1/fotos/a?token=t' });
});

Deno.test('null, undefined e lista vazia não fazem nada', async () => {
  const { db, chamadas } = armazem(assinaTudo);
  await preencherFotos(null, db);
  await preencherFotos(undefined, db);
  await preencherFotos([], db);
  assertEquals(chamadas.length, 0);
});

Deno.test('erro do storage: imagem_url null, foto_path fora e log só com o código', async () => {
  const { db } = armazem(() => ({
    data: null,
    error: { statusCode: '403', message: 'Object v1/fotos/a not found' },
  }));
  const cartoes: Cartao[] = [{ id: 'm1', imagem_url: null, foto_path: 'v1/fotos/a' }];
  const logs = await comLogs(() => preencherFotos(cartoes, db));
  assertEquals(cartoes, [{ id: 'm1', imagem_url: null }]);
  assertEquals(logs.length, 1);
  assertEquals(logs[0][1], { codigo: '403', fotos: 1 });
  assert(!JSON.stringify(logs).includes('v1/fotos/a'), 'o caminho não vai para o log');
  assert(!JSON.stringify(logs).includes('not found'), 'a mensagem não vai para o log');
});

Deno.test('storage que rebenta não rebenta o pedido', async () => {
  const { db } = armazem(() => {
    throw new Error('rede em baixo v1/fotos/a');
  });
  const cartoes: Cartao[] = [{ id: 'm1', imagem_url: null, foto_path: 'v1/fotos/a' }];
  const logs = await comLogs(() => preencherFotos(cartoes, db));
  assertEquals(cartoes, [{ id: 'm1', imagem_url: null }]);
  assertEquals(logs[0][1], { codigo: null, fotos: 1 });
});

Deno.test('sem cliente de storage: null e foto_path fora', async () => {
  const cartoes: Cartao[] = [{ id: 'm1', imagem_url: null, foto_path: 'v1/fotos/a' }];
  const logs = await comLogs(() => preencherFotos(cartoes, {}));
  assertEquals(cartoes, [{ id: 'm1', imagem_url: null }]);
  assertEquals(logs.length, 1);
});

Deno.test('um caminho sem URL fica null; os outros seguem assinados', async () => {
  const { db } = armazem(() => ({
    data: [
      { path: 'v1/fotos/a', signedUrl: 'https://s/a', error: null },
      { path: 'v2/fotos/b', signedUrl: null, error: 'Either the object does not exist' },
    ],
    error: null,
  }));
  const cartoes: Cartao[] = [
    { id: 'm1', foto_path: 'v1/fotos/a' },
    { id: 'm2', foto_path: 'v2/fotos/b' },
  ];
  const logs = await comLogs(() => preencherFotos(cartoes, db));
  assertEquals(cartoes, [
    { id: 'm1', imagem_url: 'https://s/a' },
    { id: 'm2', imagem_url: null },
  ]);
  assertEquals(logs[0][1], { codigo: 'ITEM_SEM_URL', fotos: 1 });
});
