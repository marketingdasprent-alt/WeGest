import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  bytesDoPdf,
  criarPedirPdfFatura,
  ESPERA_MAXIMA_MS,
  limparMensagem,
  nomeDoPdf,
  respostaPdf,
} from './faturaPdf.ts';

const PDF = '%PDF-1.4\n1 0 obj << >> endobj\n%%EOF';
const PDF_B64 = btoa(PDF);
const INVOICE = '2b7c0b7e-1111-4222-8333-444455556666';
const ORG = 'b1a2c3d4-0000-4000-8000-000000000001';

function fetchFalso(resposta: Response | Error) {
  const pedidos: Request[] = [];
  const f = (entrada: RequestInfo | URL, init?: RequestInit) => {
    pedidos.push(new Request(entrada, init));
    return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta);
  };
  return { pedidos, f: f as typeof fetch };
}

Deno.test('pede o PDF a faturacao-emitir com a service role e o org_id da chave', async () => {
  const { pedidos, f } = fetchFalso(
    new Response(JSON.stringify({ success: true, base64: PDF_B64 }), { status: 200 })
  );
  const pedir = criarPedirPdfFatura('https://p.supabase.co/', 'chave-servico', f);
  assertEquals(await pedir(INVOICE, ORG), { base64: PDF_B64 });
  assertEquals(pedidos.length, 1);
  const p = pedidos[0];
  assertEquals(p.url, 'https://p.supabase.co/functions/v1/faturacao-emitir');
  assertEquals(p.method, 'POST');
  assertEquals(p.headers.get('authorization'), 'Bearer chave-servico');
  assertEquals(p.headers.get('content-type'), 'application/json');
  assertEquals(await p.json(), { action: 'pdf', invoice_id: INVOICE, org_id: ORG });
});

Deno.test('falhas do fornecedor viram { erro }, nunca excepção', async () => {
  const casos: [string, Response | Error][] = [
    [
      'success false (faturacao-emitir responde 200)',
      Response.json({ success: false, error: 'x' }),
    ],
    ['sem base64', Response.json({ success: true })],
    ['HTTP 500', new Response('boom', { status: 500 })],
    ['HTTP 401', new Response('{}', { status: 401 })],
    ['corpo que não é JSON', new Response('<html>', { status: 200 })],
    ['rede em baixo', new TypeError('fetch failed')],
  ];
  for (const [nome, resposta] of casos) {
    const pedir = criarPedirPdfFatura('https://p.supabase.co', 'k', fetchFalso(resposta).f);
    const r = await pedir(INVOICE, ORG);
    assert('erro' in r, nome);
  }
});

Deno.test('espera 45 s por omissão: o Primavera pode levar até 40', () => {
  assertEquals(ESPERA_MAXIMA_MS, 45_000);
});

Deno.test('fetch que só resolve depois do abort → { erro } sem lançar', async () => {
  let abortado = false;
  const f = ((_e: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolver) => {
      // Ignora o signal: só responde (com sucesso!) depois de a espera acabar.
      init?.signal?.addEventListener('abort', () => {
        abortado = true;
        setTimeout(() => resolver(Response.json({ success: true, base64: PDF_B64 })), 5);
      });
    })) as typeof fetch;
  const r = await criarPedirPdfFatura('https://p.supabase.co', 'k', f, 20)(INVOICE, ORG);
  assert(abortado);
  assertEquals(r, { erro: 'TimeoutError' });
  await new Promise((ok) => setTimeout(ok, 10));
});

Deno.test('a mensagem do faturacao-emitir volta no erro, cortada a 200 caracteres', async () => {
  const curta = criarPedirPdfFatura(
    'https://p.supabase.co',
    'k',
    fetchFalso(Response.json({ success: false, error: 'Agente Primavera offline' })).f
  );
  assertEquals(await curta(INVOICE, ORG), { erro: 'Agente Primavera offline' });

  const longa = criarPedirPdfFatura(
    'https://p.supabase.co',
    'k',
    fetchFalso(Response.json({ success: false, error: 'falha '.repeat(100) })).f
  );
  const r = await longa(INVOICE, ORG);
  assert('erro' in r);
  assertEquals(r.erro.length, 200);

  // Também quando o estado HTTP não é 2xx e o corpo traz { error }.
  const http = criarPedirPdfFatura(
    'https://p.supabase.co',
    'k',
    fetchFalso(Response.json({ success: false, error: 'org_id inválido' }, { status: 400 })).f
  );
  assertEquals(await http(INVOICE, ORG), { erro: 'org_id inválido' });
});

Deno.test('fatura sem número no fornecedor → { erro, semPdf: true }', async () => {
  for (const mensagem of [
    'pdf: o documento não tem número no fornecedor.',
    'fatura sem provider_docnum',
  ]) {
    const pedir = criarPedirPdfFatura(
      'https://p.supabase.co',
      'k',
      fetchFalso(Response.json({ success: false, error: mensagem })).f
    );
    const r = await pedir(INVOICE, ORG);
    assert('erro' in r && r.semPdf === true, mensagem);
  }
  // Outras falhas não são "sem PDF": continuam a ser passageiras (503).
  const outra = await criarPedirPdfFatura(
    'https://p.supabase.co',
    'k',
    fetchFalso(Response.json({ success: false, error: 'timeout do agente' })).f
  )(INVOICE, ORG);
  assert('erro' in outra && !outra.semPdf);
});

Deno.test('limparMensagem: tira emails e sequências longas (token, base64)', () => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop';
  const limpa = limparMensagem(`ana@exemplo.pt falhou com ${token} e ${PDF_B64.repeat(3)}`);
  assert(!limpa.includes('ana@exemplo.pt'), limpa);
  assert(!limpa.includes(token), limpa);
  assert(!limpa.includes(PDF_B64.repeat(3)), limpa);
  assertEquals(limparMensagem('x'.repeat(300)).length <= 200, true);
});

Deno.test('sem SUPABASE_URL ou sem service role não chega a fazer o pedido', async () => {
  for (const [url, chave] of [
    ['', 'k'],
    ['https://p.supabase.co', ''],
  ]) {
    const { pedidos, f } = fetchFalso(Response.json({ success: true, base64: PDF_B64 }));
    const r = await criarPedirPdfFatura(url, chave, f)(INVOICE, ORG);
    assert('erro' in r);
    assertEquals(pedidos.length, 0);
  }
});

Deno.test('bytesDoPdf: descodifica um PDF; recusa base64 partido e o que não é PDF', () => {
  const bytes = bytesDoPdf(PDF_B64);
  assert(bytes);
  assertEquals(new TextDecoder().decode(bytes), PDF);
  // Quebras de linha no base64 (MIME) não estragam.
  assert(bytesDoPdf(PDF_B64.replace(/(.{8})/g, '$1\n')));
  assertEquals(bytesDoPdf('%%%nao-e-base64'), null);
  assertEquals(bytesDoPdf(btoa('<html>erro</html>')), null);
  assertEquals(bytesDoPdf(''), null);
});

Deno.test('nomeDoPdf: "<serie> <numero>.pdf", sem aspas nem barras', () => {
  assertEquals(nomeDoPdf('67', '12'), '67 12.pdf');
  assertEquals(nomeDoPdf('FT 2026', 7), 'FT 2026 7.pdf');
  assertEquals(nomeDoPdf('A/"B"', '1\r\n2'), 'A--B- 1--2.pdf');
  assertEquals(nomeDoPdf(null, '5'), '5.pdf');
  assertEquals(nomeDoPdf(null, null), 'fatura.pdf');
  assertEquals(nomeDoPdf('  ', ''), 'fatura.pdf');
});

Deno.test('respostaPdf: application/pdf inline, private no-store, nosniff', async () => {
  const r = respostaPdf(bytesDoPdf(PDF_B64)!, '67 12.pdf');
  assertEquals(r.status, 200);
  assertEquals(r.headers.get('content-type'), 'application/pdf');
  assertEquals(r.headers.get('content-disposition'), 'inline; filename="67 12.pdf"');
  assertEquals(r.headers.get('cache-control'), 'private, no-store');
  assertEquals(r.headers.get('x-content-type-options'), 'nosniff');
  assertEquals(await r.text(), PDF);
});
