// ============================================================
// Cloudflare Worker: api.wegest.pt → edge function api-rent-a-car
// ============================================================
// https://api.wegest.pt/v1/* faz fetch a
// https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1/*
// com o mesmo método, query e corpo e só os cabeçalhos da lista PASSAM, e devolve
// a resposta tal qual (status, corpo, Cache-Control, Vary, Retry-After, CORS),
// sem Set-Cookie. Não guarda nada em cache: o catálogo é por organização
// (Cache-Control private) e a decisão de cache é da edge function. Toda a regra
// (chave, limites, auditoria) vive lá.
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

// Só estes cabeçalhos seguem para a origem (lista de inclusão). Tudo o resto
// fica: Host e cookies de wegest.pt, hop-by-hop, cf-* e sobretudo os
// X-Forwarded-For / X-Real-IP que o cliente forje.
const PASSAM = new Set([
  'x-api-key',
  'authorization',
  'content-type',
  'accept',
  'accept-encoding',
  'origin',
  'user-agent',
  'access-control-request-method',
  'access-control-request-headers',
]);

// /v1 e no máximo dois segmentos (recurso e id), só com caracteres seguros:
// nenhum % (ex.: ..%2f) chega à origem.
const V1 = /^\/v1(?:\/[A-Za-z0-9._-]{1,64}){0,2}\/?$/;

export const CORPO_MAXIMO = 65536;

// As mesmas origens que a edge function aceita para CORS.
const ORIGENS_PERMITIDAS = new Set([
  'https://wegest.pt',
  'https://www.wegest.pt',
  'https://docs.wegest.pt',
]);

// Respostas do próprio Worker: CORS com a mesma regra da edge (Allow-Origin só
// para as origens permitidas, Vary: Origin).
function json(request, corpo, status) {
  const headers = new Headers({ 'Content-Type': 'application/json', Vary: 'Origin' });
  const origem = request.headers.get('origin');
  if (origem && ORIGENS_PERMITIDAS.has(origem)) {
    headers.set('Access-Control-Allow-Origin', origem);
  }
  return new Response(JSON.stringify(corpo), { status, headers });
}

function erro(request, codigo, mensagem, status) {
  return json(request, { erro: { codigo, mensagem } }, status);
}

function corpoDemasiadoGrande(request) {
  return erro(
    request,
    'CORPO_INVALIDO',
    `Corpo do pedido demasiado grande (máximo ${CORPO_MAXIMO} bytes).`,
    413
  );
}

function cabecalhosParaOrigem(original) {
  const h = new Headers();
  for (const [nome, valor] of original) {
    if (PASSAM.has(nome.toLowerCase())) h.set(nome, valor);
  }
  return h;
}

/** Trata um pedido. `fazerFetch` é injectável para os testes. */
export async function tratar(request, fazerFetch = fetch) {
  const url = new URL(request.url);

  if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
    return json(request, APRESENTACAO, 200);
  }
  if (!V1.test(url.pathname)) {
    return erro(request, 'NAO_ENCONTRADO', 'Rota inexistente. A API vive em /v1.', 404);
  }

  const temCorpo = request.method !== 'GET' && request.method !== 'HEAD';
  let corpo;
  if (temCorpo) {
    // Recusa pelo Content-Length antes de ler; quem não o declara (chunked) é
    // medido depois de lido.
    if (Number(request.headers.get('content-length')) > CORPO_MAXIMO) {
      return corpoDemasiadoGrande(request);
    }
    corpo = await request.arrayBuffer();
    if (corpo.byteLength > CORPO_MAXIMO) return corpoDemasiadoGrande(request);
  }
  const pedido = new Request(`${ORIGEM}${url.pathname}${url.search}`, {
    method: request.method,
    headers: cabecalhosParaOrigem(request.headers),
    body: corpo,
    redirect: 'manual',
    cache: 'no-store',
  });

  let resposta;
  try {
    resposta = await fazerFetch(pedido);
  } catch (e) {
    console.error('[api.wegest.pt] origem indisponível:', e instanceof Error ? e.message : e);
    return erro(request, 'ERRO_INTERNO', 'API temporariamente indisponível. Tente de novo.', 502);
  }
  // Tal qual (status, statusText, cabeçalhos, corpo em stream), menos o
  // Set-Cookie: api.wegest.pt não põe cookies em wegest.pt.
  const headers = new Headers(resposta.headers);
  headers.delete('set-cookie');
  return new Response(resposta.body, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers,
  });
}

export default {
  fetch(request) {
    return tratar(request);
  },
};
