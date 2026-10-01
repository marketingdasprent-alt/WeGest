// ============================================================
// Cloudflare Worker: api.wegest.pt → edge function api-rent-a-car
// ============================================================
// https://api.wegest.pt/v1/* faz fetch a
// https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1/*
// com o mesmo método, query, corpo e cabeçalhos, e devolve a resposta tal qual
// (status, corpo, Cache-Control, Vary, Retry-After, CORS). Não guarda nada em
// cache: o catálogo é por organização (Cache-Control private) e a decisão de
// cache é da edge function. Toda a regra (chave, limites, auditoria) vive lá.
//
// Existe porque a firewall da Vercel desafia rajadas de pedidos que chegam por
// wegest.pt/api/rent-a-car (403 "Vercel Security Checkpoint").
// Instruções de publicação: README.md ao lado.
// ============================================================

export const ORIGEM = 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car';

const APRESENTACAO = {
  nome: 'WeGest — API Rent-a-Car',
  versao: '1.0.0',
  documentacao: 'https://docs.wegest.pt',
};

// Cabeçalhos que não seguem para a origem: o Host é o da origem, os cookies de
// wegest.pt não são da API, os hop-by-hop são da ligação e os cf-* são do
// próprio Cloudflare.
const NAO_PASSAM = new Set([
  'host',
  'cookie',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
]);

const V1 = /^\/v1(\/|$)/;

function json(corpo, status) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function erro(codigo, mensagem, status) {
  return json({ erro: { codigo, mensagem } }, status);
}

function cabecalhosParaOrigem(original) {
  const h = new Headers();
  for (const [nome, valor] of original) {
    const n = nome.toLowerCase();
    if (NAO_PASSAM.has(n) || n.startsWith('cf-')) continue;
    h.set(nome, valor);
  }
  return h;
}

/** Trata um pedido. `fazerFetch` é injectável para os testes. */
export async function tratar(request, fazerFetch = fetch) {
  const url = new URL(request.url);

  if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
    return json(APRESENTACAO, 200);
  }
  if (!V1.test(url.pathname)) {
    return erro('NAO_ENCONTRADO', 'Rota inexistente. A API vive em /v1.', 404);
  }

  const temCorpo = request.method !== 'GET' && request.method !== 'HEAD';
  const pedido = new Request(`${ORIGEM}${url.pathname}${url.search}`, {
    method: request.method,
    headers: cabecalhosParaOrigem(request.headers),
    body: temCorpo ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
    cache: 'no-store',
  });

  let resposta;
  try {
    resposta = await fazerFetch(pedido);
  } catch (e) {
    console.error('[api.wegest.pt] origem indisponível:', e instanceof Error ? e.message : e);
    return erro('ERRO_INTERNO', 'API temporariamente indisponível. Tente de novo.', 502);
  }
  // Tal qual: status, statusText, cabeçalhos e corpo em stream.
  return new Response(resposta.body, resposta);
}

export default {
  fetch(request) {
    return tratar(request);
  },
};
