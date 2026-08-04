import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertBoltOk,
  BoltApiError,
  callBolt,
  getRetryAfterMs,
  limparCacheTokens,
  listarEmpresas,
  obterToken,
  paginar,
} from "./client.ts";
import type { BoltCredenciais, FleetOrder } from "./client.ts";

// ---------------------------------------------------------------------------
// Andaimes: fetch trocado por stub (os testes correm sem --allow-net)
// ---------------------------------------------------------------------------

interface PedidoRegistado {
  url: string;
  metodo: string;
  corpo: unknown;
  temCorpo: boolean;
}

const fetchOriginal = globalThis.fetch;

const cred = (clientId: string): BoltCredenciais => ({ clientId, clientSecret: "segredo-nunca-logado" });

const respostaToken = (expiresIn = 600) =>
  new Response(
    JSON.stringify({ access_token: `tok-${expiresIn}`, expires_in: expiresIn, token_type: "Bearer" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const respostaJson = (corpo: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

/**
 * Instala um fetch falso. O manipulador só vê os pedidos à API; os pedidos ao
 * OIDC são respondidos automaticamente com um token de `expiresIn` segundos.
 */
function instalarFetch(
  manipulador: (pedido: PedidoRegistado, nDados: number) => Response,
  expiresIn = 600,
) {
  const pedidos: PedidoRegistado[] = [];
  let nDados = 0;

  globalThis.fetch = ((entrada: URL | RequestInfo, init?: RequestInit) => {
    const bruto = init?.body;
    let corpo: unknown;
    if (typeof bruto === "string") {
      try {
        corpo = JSON.parse(bruto);
      } catch {
        corpo = bruto;
      }
    } else if (bruto instanceof URLSearchParams) {
      corpo = Object.fromEntries(bruto.entries());
    }

    const pedido: PedidoRegistado = {
      url: String(entrada),
      metodo: init?.method ?? "GET",
      corpo,
      temCorpo: bruto !== undefined && bruto !== null,
    };
    pedidos.push(pedido);

    if (pedido.url.startsWith("https://oidc.bolt.eu")) {
      return Promise.resolve(respostaToken(expiresIn));
    }

    nDados += 1;
    return Promise.resolve(manipulador(pedido, nDados));
  }) as typeof fetch;

  return pedidos;
}

function restaurar() {
  globalThis.fetch = fetchOriginal;
  limparCacheTokens();
}

const soDados = (pedidos: PedidoRegistado[]) => pedidos.filter((p) => p.url.includes("/fleetIntegration/"));
const soToken = (pedidos: PedidoRegistado[]) => pedidos.filter((p) => p.url.startsWith("https://oidc.bolt.eu"));

// ---------------------------------------------------------------------------
// assertBoltOk — a armadilha do HTTP 200
// ---------------------------------------------------------------------------

Deno.test("assertBoltOk lança em code !== 0 e identifica o código conhecido", () => {
  let capturado: unknown;
  try {
    assertBoltOk({ code: 498810, message: "Company not allowed" });
  } catch (erro) {
    capturado = erro;
  }

  assertEquals(capturado instanceof BoltApiError, true);
  assertEquals((capturado as BoltApiError).codigo, 498810);
  assertEquals((capturado as BoltApiError).message.includes("COMPANY_NOT_ALLOWED"), true);
  assertEquals((capturado as BoltApiError).message.includes("Company not allowed"), true);
});

Deno.test("assertBoltOk inclui os validation_errors na mensagem", () => {
  let mensagem = "";
  try {
    assertBoltOk({
      code: 702,
      message: "Invalid request",
      validation_errors: [{ property: "company_ids", error: "must be an array" }],
    });
  } catch (erro) {
    mensagem = (erro as Error).message;
  }

  assertEquals(mensagem.includes("company_ids: must be an array"), true);
});

Deno.test("assertBoltOk deixa passar code 0 e corpos sem code", () => {
  assertBoltOk({ code: 0, data: { company_ids: [1] } });
  assertBoltOk({ data: { orders: [] } });
  assertBoltOk(null);
});

// ---------------------------------------------------------------------------
// callBolt
// ---------------------------------------------------------------------------

Deno.test("callBolt lança quando a Bolt devolve code 498810 com HTTP 200 (e não repete)", async () => {
  const pedidos = instalarFetch(() => respostaJson({ code: 498810, message: "Company not allowed" }));

  try {
    const erro = await assertRejects(
      () => callBolt(cred("cid-498810"), "getDrivers", { company_id: 1, start_ts: 1, end_ts: 2 }),
      BoltApiError,
      "498810",
    );
    assertEquals(erro.codigo, 498810);
    // Erro determinista: uma só chamada, sem retentativas.
    assertEquals(soDados(pedidos).length, 1);
  } finally {
    restaurar();
  }
});

Deno.test("callBolt devolve o corpo quando code é 0", async () => {
  instalarFetch(() => respostaJson({ code: 0, data: { total_orders: 0, orders: [] } }));

  try {
    const corpo = await callBolt<{ data: { total_orders: number } }>(
      cred("cid-ok"),
      "getFleetOrders",
      { company_ids: [1], start_ts: 1, end_ts: 2 },
    );
    assertEquals(corpo.data.total_orders, 0);
  } finally {
    restaurar();
  }
});

Deno.test("getCompanies vai em GET e sem corpo", async () => {
  const pedidos = instalarFetch(() => respostaJson({ code: 0, data: { company_ids: [11, 22] } }));

  try {
    const empresas = await listarEmpresas(cred("cid-companies"));

    assertEquals(empresas, [11, 22]);
    const dados = soDados(pedidos);
    assertEquals(dados.length, 1);
    assertEquals(dados[0].metodo, "GET");
    assertEquals(dados[0].temCorpo, false);
    assertEquals(dados[0].url.endsWith("/fleetIntegration/v1/getCompanies"), true);
  } finally {
    restaurar();
  }
});

Deno.test("getVehicles nunca envia limit acima de 100", async () => {
  const pedidos = instalarFetch(() => respostaJson({ code: 0, data: { vehicles: [] } }));

  try {
    await callBolt(cred("cid-vehicles"), "getVehicles", {
      company_id: 5,
      start_ts: 1,
      end_ts: 2,
      limit: 1000,
    });

    const corpo = soDados(pedidos)[0].corpo as Record<string, unknown>;
    assertEquals(corpo.limit, 100);
    assertEquals(corpo.offset, 0);
  } finally {
    restaurar();
  }
});

Deno.test("getVehicles sem limit usa o valor por defeito e envia offset (Pager obrigatório)", async () => {
  const pedidos = instalarFetch(() => respostaJson({ code: 0, data: { vehicles: [] } }));

  try {
    await callBolt(cred("cid-vehicles-def"), "getVehicles", { company_id: 5, start_ts: 1, end_ts: 2 });

    const corpo = soDados(pedidos)[0].corpo as Record<string, unknown>;
    assertEquals(corpo.limit, 100);
    assertEquals(corpo.offset, 0);
  } finally {
    restaurar();
  }
});

Deno.test("getDrivers envia company_id singular, mesmo recebendo company_ids", async () => {
  const pedidos = instalarFetch(() => respostaJson({ code: 0, data: { drivers: [] } }));

  try {
    await callBolt(cred("cid-drivers"), "getDrivers", { company_ids: [77], start_ts: 1, end_ts: 2 });

    const corpo = soDados(pedidos)[0].corpo as Record<string, unknown>;
    assertEquals(corpo.company_id, 77);
    assertEquals("company_ids" in corpo, false);
  } finally {
    restaurar();
  }
});

Deno.test("getFleetOrders envia company_ids em array, mesmo recebendo company_id", async () => {
  const pedidos = instalarFetch(() => respostaJson({ code: 0, data: { total_orders: 0, orders: [] } }));

  try {
    await callBolt(cred("cid-orders"), "getFleetOrders", { company_id: 77, start_ts: 1, end_ts: 2 });

    const corpo = soDados(pedidos)[0].corpo as Record<string, unknown>;
    assertEquals(corpo.company_ids, [77]);
    assertEquals("company_id" in corpo, false);
  } finally {
    restaurar();
  }
});

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

Deno.test("o token é reutilizado da cache dentro da validade", async () => {
  const pedidos = instalarFetch(() => respostaJson({ code: 0, data: { drivers: [] } }), 600);

  try {
    const credenciais = cred("cid-cache");
    await callBolt(credenciais, "getDrivers", { company_id: 1, start_ts: 1, end_ts: 2 });
    await callBolt(credenciais, "getDrivers", { company_id: 1, start_ts: 1, end_ts: 2 });
    const token = await obterToken(credenciais);

    assertEquals(soDados(pedidos).length, 2);
    assertEquals(soToken(pedidos).length, 1); // um só pedido ao OIDC
    assertEquals(token, "tok-600");
  } finally {
    restaurar();
  }
});

Deno.test("o token é renovado quando entra na margem dos 60s", async () => {
  // 30s de vida < 60s de margem: o que está em cache já não serve.
  const pedidos = instalarFetch(() => respostaJson({ code: 0, data: { drivers: [] } }), 30);

  try {
    const credenciais = cred("cid-expira");
    await callBolt(credenciais, "getDrivers", { company_id: 1, start_ts: 1, end_ts: 2 });
    await callBolt(credenciais, "getDrivers", { company_id: 1, start_ts: 1, end_ts: 2 });

    assertEquals(soToken(pedidos).length, 2);
  } finally {
    restaurar();
  }
});

Deno.test("a cache do token é por client_id", async () => {
  const pedidos = instalarFetch(() => respostaJson({ code: 0, data: { drivers: [] } }), 600);

  try {
    await callBolt(cred("cid-empresa-a"), "getDrivers", { company_id: 1, start_ts: 1, end_ts: 2 });
    await callBolt(cred("cid-empresa-b"), "getDrivers", { company_id: 2, start_ts: 1, end_ts: 2 });

    assertEquals(soToken(pedidos).length, 2);
    const corposToken = soToken(pedidos).map((p) => (p.corpo as Record<string, string>).client_id);
    assertEquals(corposToken, ["cid-empresa-a", "cid-empresa-b"]);
  } finally {
    restaurar();
  }
});

// ---------------------------------------------------------------------------
// Retentativas
// ---------------------------------------------------------------------------

Deno.test("429 com Retry-After é repetido e honra a espera indicada", async () => {
  const pedidos = instalarFetch((_pedido, n) =>
    n === 1
      ? new Response("rate limited", { status: 429, headers: { "Retry-After": "1" } })
      : respostaJson({ code: 0, data: { drivers: [{ driver_uuid: "d1" }] } })
  );

  try {
    const inicio = Date.now();
    const corpo = await callBolt<{ data: { drivers: unknown[] } }>(
      cred("cid-429"),
      "getDrivers",
      { company_id: 1, start_ts: 1, end_ts: 2 },
    );
    const decorrido = Date.now() - inicio;

    assertEquals(corpo.data.drivers.length, 1);
    assertEquals(soDados(pedidos).length, 2);
    assertEquals(decorrido >= 900, true); // esperou o ~1s do Retry-After
  } finally {
    restaurar();
  }
});

Deno.test("4xx que não seja 429 não é repetido", async () => {
  const pedidos = instalarFetch(() => respostaJson({ mensagem: "pedido inválido" }, { status: 400 }));

  try {
    await assertRejects(
      () => callBolt(cred("cid-400"), "getDrivers", { company_id: 1, start_ts: 1, end_ts: 2 }),
      Error,
      "HTTP 400",
    );
    assertEquals(soDados(pedidos).length, 1);
  } finally {
    restaurar();
  }
});

Deno.test("getRetryAfterMs: segundos, HTTP-date e tecto de 30s", () => {
  const comCabecalho = (valor: string) => new Response(null, { headers: { "Retry-After": valor } });

  assertEquals(getRetryAfterMs(comCabecalho("5"), 0), 5000);
  assertEquals(getRetryAfterMs(comCabecalho("120"), 0), 30_000); // tecto

  const daquiA10s = new Date(Date.now() + 10_000).toUTCString();
  const espera = getRetryAfterMs(comCabecalho(daquiA10s), 0);
  assertEquals(espera > 8_000 && espera <= 10_000, true);

  // Sem cabeçalho: backoff exponencial 2s, 4s, 8s… com jitter até 250ms.
  const semCabecalho = new Response(null);
  const base = getRetryAfterMs(semCabecalho, 0);
  assertEquals(base >= 2000 && base < 2250, true);
});

// ---------------------------------------------------------------------------
// Paginação
// ---------------------------------------------------------------------------

Deno.test("paginar acumula as páginas e confirma o total_orders declarado", async () => {
  const paginas = [
    { code: 0, data: { total_orders: 3, orders: [{ order_reference: "a" }, { order_reference: "b" }] } },
    { code: 0, data: { total_orders: 3, orders: [{ order_reference: "c" }] } },
  ];
  const pedidos = instalarFetch((_pedido, n) => respostaJson(paginas[n - 1]));

  try {
    const ordens = await paginar<FleetOrder>(
      cred("cid-paginar"),
      "getFleetOrders",
      { company_ids: [1], start_ts: 1, end_ts: 2 },
      { limite: 2 },
    );

    assertEquals(ordens.map((o) => o.order_reference), ["a", "b", "c"]);
    const dados = soDados(pedidos);
    assertEquals(dados.length, 2);
    assertEquals((dados[0].corpo as Record<string, unknown>).offset, 0);
    assertEquals((dados[1].corpo as Record<string, unknown>).offset, 2);
    assertEquals((dados[1].corpo as Record<string, unknown>).limit, 2);
  } finally {
    restaurar();
  }
});

Deno.test("paginar lança quando traz menos registos do que o total declarado", async () => {
  // A Bolt diz 5, só entrega 1: silenciar isto seria dinheiro a faltar no acerto.
  instalarFetch(() => respostaJson({ code: 0, data: { total_orders: 5, orders: [{ order_reference: "a" }] } }));

  try {
    await assertRejects(
      () =>
        paginar<FleetOrder>(
          cred("cid-paginar-falta"),
          "getFleetOrders",
          { company_ids: [1], start_ts: 1, end_ts: 2 },
          { limite: 2 },
        ),
      Error,
      "declarou 5 registos",
    );
  } finally {
    restaurar();
  }
});

Deno.test("paginar recusa endpoints não paginados", async () => {
  await assertRejects(
    () => paginar(cred("cid-nao-paginado"), "getCompanies"),
    Error,
    "não é um endpoint paginado",
  );
});
