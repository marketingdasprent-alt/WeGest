import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  BUCKET_DOCUMENTOS,
  criarArmazemDocumentos,
  expiracaoDoToken,
  type StorageSupabase,
} from './armazemDocumentos.ts';

const jwt = (payload: unknown) =>
  `e30.${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.x`;

function clienteFalso(balde: Partial<ReturnType<StorageSupabase['storage']['from']>>) {
  const baldes: string[] = [];
  const cliente: StorageSupabase = {
    storage: {
      from(b) {
        baldes.push(b);
        return {
          createSignedUploadUrl: () => Promise.resolve({ data: null, error: null }),
          info: () => Promise.resolve({ data: null, error: null }),
          download: () => Promise.resolve({ data: null, error: null }),
          remove: () => Promise.resolve({ data: null, error: null }),
          ...balde,
        };
      },
    },
  };
  return { cliente, baldes };
}

Deno.test('expiracaoDoToken lê o exp do JWT; sem ele, 2 h a partir de agora', () => {
  assertEquals(expiracaoDoToken(jwt({ exp: 1790000000 })), '2026-09-21T14:13:20.000Z');
  assertEquals(
    expiracaoDoToken('lixo', Date.parse('2026-10-16T10:00:00Z')),
    '2026-10-16T12:00:00.000Z'
  );
  assertEquals(
    expiracaoDoToken(jwt({}), Date.parse('2026-10-16T10:00:00Z')),
    '2026-10-16T12:00:00.000Z'
  );
});

Deno.test('assinarEnvio usa o bucket motorista-documentos e devolve URL e expiração', async () => {
  const { cliente, baldes } = clienteFalso({
    createSignedUploadUrl: () =>
      Promise.resolve({
        data: { signedUrl: 'https://s/upload?token=t', token: jwt({ exp: 1790000000 }) },
        error: null,
      }),
  });
  const r = await criarArmazemDocumentos(cliente).assinarEnvio('u/candidatura/x/y.jpg');
  assertEquals(r, { url: 'https://s/upload?token=t', expiraEm: '2026-09-21T14:13:20.000Z' });
  assertEquals(baldes, [BUCKET_DOCUMENTOS]);
});

Deno.test('assinarEnvio: erro ou excepção do storage → { erro } sem a mensagem', async () => {
  for (const balde of [
    {
      createSignedUploadUrl: () =>
        Promise.resolve({
          data: null,
          error: { name: 'StorageError', status: 500, message: 'u/candidatura/x' },
        }),
    },
    { createSignedUploadUrl: () => Promise.reject(new Error('u/candidatura/x')) },
  ]) {
    const r = await criarArmazemDocumentos(clienteFalso(balde).cliente).assinarEnvio('c');
    assert('erro' in r);
    assert(!JSON.stringify(r).includes('candidatura'));
  }
});

Deno.test('info: tamanho, 404 → naoExiste, outro erro → erro', async () => {
  const com = (res: { data: { size?: number } | null; error: unknown }) =>
    criarArmazemDocumentos(clienteFalso({ info: () => Promise.resolve(res) }).cliente).info('c');
  assertEquals(await com({ data: { size: 123 }, error: null }), { tamanho: 123 });
  assertEquals(await com({ data: null, error: { status: 404 } }), { naoExiste: true });
  assertEquals(await com({ data: null, error: { statusCode: '404' } }), { naoExiste: true });
  assert('erro' in (await com({ data: null, error: { status: 500 } })));
  assert('erro' in (await com({ data: {}, error: null })));
});

Deno.test('inicio lê só os primeiros bytes do download', async () => {
  const blob = new Blob([Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])]);
  const a = criarArmazemDocumentos(
    clienteFalso({ download: () => Promise.resolve({ data: blob, error: null }) }).cliente
  );
  assertEquals(await a.inicio('c', 4), { bytes: Uint8Array.from([1, 2, 3, 4]) });
  const b = criarArmazemDocumentos(
    clienteFalso({ download: () => Promise.resolve({ data: null, error: { status: 404 } }) })
      .cliente
  );
  assertEquals(await b.inicio('c', 4), { naoExiste: true });
});

Deno.test('apagar devolve true se apagou, false (com log sem caminho) se falhou', async () => {
  const caminhos: string[][] = [];
  const bom = criarArmazemDocumentos(
    clienteFalso({ remove: (p) => (caminhos.push(p), Promise.resolve({ data: [], error: null })) })
      .cliente
  );
  assertEquals(await bom.apagar('u/c.jpg'), true);
  assertEquals(caminhos, [['u/c.jpg']]);
  const antes = console.error;
  const logs: unknown[][] = [];
  console.error = (...a: unknown[]) => logs.push(a);
  try {
    const mau = criarArmazemDocumentos(
      clienteFalso({
        remove: () => Promise.resolve({ data: null, error: { status: 500, message: 'u/c.jpg' } }),
      }).cliente
    );
    assertEquals(await mau.apagar('u/c.jpg'), false);
  } finally {
    console.error = antes;
  }
  assert(!JSON.stringify(logs).includes('u/c.jpg'));
});
