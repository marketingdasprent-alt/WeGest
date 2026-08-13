/**
 * Cliente partilhado da API de frota da Bolt (fleet-integration-gateway).
 *
 * Concentra num só sítio aquilo que as edge functions da Bolt andavam a repetir
 * (e a fazer mal): OAuth2 client_credentials com cache do token, a verificação
 * dos erros que a Bolt devolve com HTTP 200, as retentativas com backoff e a
 * paginação com validação do total.
 *
 * PRIVACIDADE: as respostas trazem nomes, telefones e moradas de passageiros.
 * NUNCA fazer console.log do corpo das respostas — só contagens, códigos de
 * erro e estados HTTP. O client_secret nunca vai para log nem para a BD.
 *
 * TypeScript puro (só fetch/setTimeout), para os testes correrem sem rede.
 */

const BOLT_API_BASE = "https://node.bolt.eu/fleet-integration-gateway";
const BOLT_TOKEN_URL = "https://oidc.bolt.eu/token";
const BOLT_SCOPE = "fleet-integration:api";

/** O token da Bolt vive 600s. Renovamos 60s antes do fim para não apanhar a fronteira. */
const MARGEM_TOKEN_MS = 60_000;
const VIDA_TOKEN_POR_DEFEITO_S = 600;

/** Tentativas totais (a primeira incluída) por pedido. */
const MAX_TENTATIVAS = 5;
/** Tecto da espera entre tentativas — igual ao que já estava em bolt-sync. */
const TECTO_ESPERA_MS = 30_000;

// ---------------------------------------------------------------------------
// Operações e endpoints — a API da Bolt tem exactamente estes 6.
// ---------------------------------------------------------------------------

export type BoltOperacao =
  | "getCompanies"
  | "test"
  | "getFleetOrders"
  | "getDrivers"
  | "getVehicles"
  | "getFleetStateLogs";

const ENDPOINTS: Record<BoltOperacao, string> = {
  getCompanies: "/fleetIntegration/v1/getCompanies",
  test: "/fleetIntegration/v1/test",
  getFleetOrders: "/fleetIntegration/v1/getFleetOrders",
  getDrivers: "/fleetIntegration/v1/getDrivers",
  getVehicles: "/fleetIntegration/v1/getVehicles",
  getFleetStateLogs: "/fleetIntegration/v1/getFleetStateLogs",
};

/** getCompanies é o único GET e vai sem corpo. */
const OPERACOES_GET: ReadonlySet<BoltOperacao> = new Set<BoltOperacao>(["getCompanies"]);

/**
 * limit/offset são obrigatórios (schema Pager) nestes endpoints.
 * getVehicles está limitado a 100 pela spec; getFleetOrders a 1000. Para
 * getDrivers e getFleetStateLogs a spec não documenta o tecto, usamos o
 * genérico do Pager (1000).
 */
const PAGINACAO: Partial<Record<BoltOperacao, { defeito: number; max: number }>> = {
  getFleetOrders: { defeito: 500, max: 1000 },
  getDrivers: { defeito: 100, max: 1000 },
  getVehicles: { defeito: 100, max: 100 },
  getFleetStateLogs: { defeito: 100, max: 1000 },
};

/** Códigos de erro conhecidos da Bolt (chegam com HTTP 200 no corpo). */
export const ERROS_BOLT: Readonly<Record<number, string>> = {
  702: "INVALID_REQUEST",
  498805: "INVALID_START_DATE",
  498806: "INVALID_DATE_RANGE",
  498809: "COMPANY_NOT_ACTIVE",
  498810: "COMPANY_NOT_ALLOWED",
};

// ---------------------------------------------------------------------------
// Tipos da API
// ---------------------------------------------------------------------------

export interface BoltCredenciais {
  clientId: string;
  clientSecret: string;
}

/** Parâmetros de um pedido. company_id/company_ids são normalizados por operação. */
export interface BoltParams {
  company_id?: number;
  company_ids?: number[];
  start_ts?: number;
  end_ts?: number;
  limit?: number;
  offset?: number;
  [chave: string]: unknown;
}

/** OrderPriceData — a spec define exactamente estes campos. */
export interface OrderPriceData {
  ride_price: number;
  booking_fee: number;
  toll_fee: number;
  cancellation_fee: number;
  tip: number;
  net_earnings: number;
  cash_discount: number;
  in_app_discount: number;
  commission: number;
}

/**
 * FleetOrder. Só order_price está fechado na spec; os restantes campos são os
 * que a Bolt devolve e que o bolt-sync já consumia — opcionais por precaução.
 */
export interface FleetOrder {
  order_reference: string;
  order_status?: string;
  order_created_timestamp?: number;
  payment_confirmed_timestamp?: number;
  payment_method?: string;
  driver_uuid?: string;
  driver_name?: string;
  driver_phone?: string;
  vehicle_model?: string;
  vehicle_license_plate?: string;
  pickup_address?: string;
  destination_address?: string;
  /** Distância da viagem. A unidade NÃO está confirmada (provavelmente metros). */
  ride_distance?: number;
  order_price?: OrderPriceData;
}

export type FleetDriverState = "active" | "suspended" | "deactivated";

/** Viatura activa tal como vem embutida no motorista. */
export interface FleetDriverVehicle {
  id: number;
  uuid: string;
  model: string;
  year: number;
  reg_number: string;
  vin: string;
  state: string;
}

export interface FleetDriver {
  driver_uuid: string;
  partner_uuid?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  state?: FleetDriverState;
  has_cash_payment?: boolean;
  driver_score?: number;
  driver_rating?: number;
  active_categories?: string[];
  inactive_categories?: string[];
  active_vehicle?: FleetDriverVehicle;
}

/** FleetVehicle — a spec só documenta o mesmo núcleo do active_vehicle. */
export interface FleetVehicle {
  id: number;
  uuid?: string;
  model?: string;
  year?: number;
  reg_number?: string;
  vin?: string;
  state?: string;
}

export interface RespostaFleetOrders {
  data?: {
    company_id?: number;
    company_name?: string;
    total_orders?: number;
    orders?: FleetOrder[];
  };
}

/** Erro de negócio da Bolt — vem no corpo com HTTP 200 e nunca se repete. */
export class BoltApiError extends Error {
  readonly codigo: number;
  readonly codigoNome?: string;

  constructor(codigo: number, mensagem: string, codigoNome?: string) {
    super(mensagem);
    this.name = "BoltApiError";
    this.codigo = codigo;
    this.codigoNome = codigoNome;
  }
}

// ---------------------------------------------------------------------------
// Token — cache em memória por client_id. Nunca persistido.
// ---------------------------------------------------------------------------

interface TokenEmCache {
  token: string;
  /** Instante (ms) a partir do qual já não serve, com a margem descontada. */
  expiraEm: number;
}

const cacheTokens = new Map<string, TokenEmCache>();
/** Pedidos de token em curso, para N chamadas em paralelo não pedirem N tokens. */
const tokensEmCurso = new Map<string, Promise<string>>();

/** Limpa a cache de tokens (rotação de credenciais e testes). */
export function limparCacheTokens(clientId?: string): void {
  if (clientId) {
    cacheTokens.delete(clientId);
    tokensEmCurso.delete(clientId);
    return;
  }
  cacheTokens.clear();
  tokensEmCurso.clear();
}

/**
 * Validade restante (segundos) do token em cache para estas credenciais, já
 * com a margem de renovação somada de volta — é a vida real que a Bolt
 * anunciou, não o instante em que decidimos renovar.
 *
 * Só serve para diagnóstico (bolt-test-connection mostra ao utilizador quanto
 * dura o token que acabou de obter). Quem faz pedidos não precisa disto:
 * obterToken trata da renovação sozinho. Devolve null se não houver token.
 */
export function validadeTokenSegundos(clientId: string): number | null {
  const emCache = cacheTokens.get(clientId);
  if (!emCache) return null;
  return Math.max(0, Math.round((emCache.expiraEm + MARGEM_TOKEN_MS - Date.now()) / 1000));
}

/** Identificador seguro para log — o client_id nunca aparece inteiro. */
function mascarar(clientId: string): string {
  if (!clientId) return "(vazio)";
  return `${clientId.slice(0, 6)}…`;
}

export async function obterToken(cred: BoltCredenciais): Promise<string> {
  const emCache = cacheTokens.get(cred.clientId);
  if (emCache && emCache.expiraEm > Date.now()) {
    return emCache.token;
  }

  const emCurso = tokensEmCurso.get(cred.clientId);
  if (emCurso) return emCurso;

  const pedido = pedirTokenNovo(cred).finally(() => {
    tokensEmCurso.delete(cred.clientId);
  });
  tokensEmCurso.set(cred.clientId, pedido);
  return pedido;
}

async function pedirTokenNovo(cred: BoltCredenciais): Promise<string> {
  const pedidoEm = Date.now();

  const resposta = await fetch(BOLT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      grant_type: "client_credentials",
      scope: BOLT_SCOPE,
    }),
  });

  if (!resposta.ok) {
    // Sem corpo no erro: a resposta do OIDC pode ecoar credenciais.
    cacheTokens.delete(cred.clientId);
    throw new Error(
      `Falha na autenticação Bolt (HTTP ${resposta.status}) para client_id ${mascarar(cred.clientId)}`,
    );
  }

  const dados = (await resposta.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number }
    | null;

  if (!dados?.access_token) {
    throw new Error(
      `Resposta de token da Bolt sem access_token para client_id ${mascarar(cred.clientId)}`,
    );
  }

  const vidaSegundos = typeof dados.expires_in === "number" && dados.expires_in > 0
    ? dados.expires_in
    : VIDA_TOKEN_POR_DEFEITO_S;

  cacheTokens.set(cred.clientId, {
    token: dados.access_token,
    expiraEm: pedidoEm + vidaSegundos * 1000 - MARGEM_TOKEN_MS,
  });

  return dados.access_token;
}

// ---------------------------------------------------------------------------
// Erros com HTTP 200
// ---------------------------------------------------------------------------

/**
 * A armadilha da API da Bolt: os erros chegam com HTTP 200 e o corpo
 * { code, message, validation_errors }. code === 0 é OK; qualquer outro é erro.
 */
export function assertBoltOk(corpo: unknown): void {
  if (!corpo || typeof corpo !== "object") return;

  const { code, message, validation_errors } = corpo as {
    code?: unknown;
    message?: unknown;
    validation_errors?: unknown;
  };

  const codigo = typeof code === "number"
    ? code
    : typeof code === "string" && code.trim() !== "" && !Number.isNaN(Number(code))
    ? Number(code)
    : undefined;

  if (codigo === undefined || codigo === 0) return;

  const nome = ERROS_BOLT[codigo];
  const texto = typeof message === "string" && message ? message : "sem mensagem";
  const detalhes = formatarValidationErrors(validation_errors);

  throw new BoltApiError(
    codigo,
    `Erro da API Bolt ${codigo}${nome ? ` (${nome})` : ""}: ${texto}${detalhes ? ` — ${detalhes}` : ""}`,
    nome,
  );
}

/** validation_errors referem-se aos parâmetros do pedido — sem dados pessoais. */
function formatarValidationErrors(erros: unknown): string {
  if (!erros) return "";

  const partes = Array.isArray(erros)
    ? erros.map((erro) => {
      if (erro && typeof erro === "object") {
        const { property, error } = erro as { property?: unknown; error?: unknown };
        if (property !== undefined || error !== undefined) {
          return `${String(property ?? "?")}: ${String(error ?? "?")}`;
        }
      }
      return JSON.stringify(erro);
    })
    : [JSON.stringify(erros)];

  return partes.join("; ").slice(0, 500);
}

// ---------------------------------------------------------------------------
// Retentativas
// ---------------------------------------------------------------------------

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/** Backoff exponencial com jitter: 2s, 4s, 8s… com tecto de 30s. */
function backoffMs(tentativa: number): number {
  const base = Math.min(1000 * Math.pow(2, tentativa + 1), TECTO_ESPERA_MS);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

/**
 * Espera antes da próxima tentativa, honrando o Retry-After (segundos ou
 * HTTP-date) com tecto de 30s. Portado de bolt-sync/index.ts.
 */
export function getRetryAfterMs(resposta: Response, tentativa: number): number {
  const retryAfter = resposta.headers.get("retry-after");
  if (retryAfter) {
    const emSegundos = Number(retryAfter);
    if (!Number.isNaN(emSegundos) && emSegundos > 0) {
      return Math.min(emSegundos * 1000, TECTO_ESPERA_MS);
    }

    const comoData = Date.parse(retryAfter);
    if (!Number.isNaN(comoData)) {
      const ms = comoData - Date.now();
      if (ms > 0) return Math.min(ms, TECTO_ESPERA_MS);
    }
  }

  return backoffMs(tentativa);
}

/** Só 429 e 5xx se repetem. Os restantes 4xx são deterministas. */
function estadoRepetivel(estado: number): boolean {
  return estado === 429 || estado >= 500;
}

// ---------------------------------------------------------------------------
// Chamada
// ---------------------------------------------------------------------------

function limitar(valor: number, minimo: number, maximo: number): number {
  if (!Number.isFinite(valor)) return minimo;
  return Math.min(Math.max(Math.floor(valor), minimo), maximo);
}

/**
 * Normaliza o corpo por operação: getFleetOrders usa company_ids (ARRAY), os
 * restantes usam company_id (SINGULAR) — trocar os dois dá 702 INVALID_REQUEST.
 */
function prepararCorpo(operacao: BoltOperacao, params: BoltParams): Record<string, unknown> {
  const { company_id, company_ids, limit, offset, ...resto } = params;
  const corpo: Record<string, unknown> = { ...resto };

  if (operacao === "getFleetOrders") {
    const ids = company_ids ?? (company_id !== undefined ? [company_id] : undefined);
    if (ids && ids.length > 0) corpo.company_ids = ids;
  } else if (operacao !== "test") {
    const id = company_id ?? company_ids?.[0];
    if (id !== undefined) corpo.company_id = id;
  } else {
    if (company_id !== undefined) corpo.company_id = company_id;
    if (company_ids !== undefined) corpo.company_ids = company_ids;
  }

  const pag = PAGINACAO[operacao];
  if (pag) {
    corpo.limit = limitar(limit ?? pag.defeito, 1, pag.max);
    corpo.offset = Math.max(0, Math.floor(offset ?? 0));
  }

  return corpo;
}

export async function callBolt<T>(
  cred: BoltCredenciais,
  operacao: BoltOperacao,
  params: BoltParams = {},
): Promise<T> {
  const endpoint = ENDPOINTS[operacao];
  if (!endpoint) {
    throw new Error(`Operação Bolt desconhecida: ${operacao}`);
  }

  const usaGet = OPERACOES_GET.has(operacao);
  const corpoPedido = usaGet ? undefined : JSON.stringify(prepararCorpo(operacao, params));
  const url = `${BOLT_API_BASE}${endpoint}`;

  let ultimoErro: Error | null = null;

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    const token = await obterToken(cred);

    const cabecalhos: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (!usaGet) cabecalhos["Content-Type"] = "application/json";

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: usaGet ? "GET" : "POST",
        headers: cabecalhos,
        ...(usaGet ? {} : { body: corpoPedido }),
      });
    } catch (erro) {
      // Falha de rede/DNS: repetível.
      ultimoErro = erro instanceof Error ? erro : new Error(String(erro));
      if (tentativa === MAX_TENTATIVAS - 1) break;
      const espera = backoffMs(tentativa);
      console.warn(
        `[bolt] ${operacao}: falha de rede — nova tentativa ${tentativa + 2}/${MAX_TENTATIVAS} daqui a ${espera}ms`,
      );
      await dormir(espera);
      continue;
    }

    // Consumir sempre o corpo, mesmo quando vamos repetir, para não deixar
    // ligações penduradas.
    const texto = await resposta.text().catch(() => "");

    if (estadoRepetivel(resposta.status) && tentativa < MAX_TENTATIVAS - 1) {
      const espera = getRetryAfterMs(resposta, tentativa);
      ultimoErro = new Error(`[bolt] ${operacao}: HTTP ${resposta.status}`);
      console.warn(
        `[bolt] ${operacao}: HTTP ${resposta.status} — nova tentativa ${tentativa + 2}/${MAX_TENTATIVAS} daqui a ${espera}ms`,
      );
      await dormir(espera);
      continue;
    }

    let corpo: unknown = null;
    if (texto) {
      try {
        corpo = JSON.parse(texto);
      } catch {
        // Sem ecoar o corpo: pode trazer dados de passageiros.
        throw new Error(
          `[bolt] ${operacao}: resposta não-JSON (HTTP ${resposta.status}, ${texto.length} bytes)`,
        );
      }
    }

    // ANTES do response.ok: os erros da Bolt vêm com HTTP 200.
    // BoltApiError é determinista (498805/498806/498809/498810, 702…) e nunca repete.
    assertBoltOk(corpo);

    if (!resposta.ok) {
      throw new Error(`[bolt] ${operacao}: HTTP ${resposta.status}`);
    }

    return corpo as T;
  }

  throw ultimoErro ??
    new Error(`[bolt] ${operacao}: esgotadas as ${MAX_TENTATIVAS} tentativas`);
}

// ---------------------------------------------------------------------------
// Atalhos
// ---------------------------------------------------------------------------

/** GET getCompanies (sem corpo) — devolve os company_id a que as credenciais dão acesso. */
export async function listarEmpresas(cred: BoltCredenciais): Promise<number[]> {
  const corpo = await callBolt<{ data?: { company_ids?: number[] } }>(cred, "getCompanies");
  const ids = corpo?.data?.company_ids ?? [];
  console.log(`[bolt] getCompanies: ${ids.length} empresa(s)`);
  return ids;
}

// ---------------------------------------------------------------------------
// Paginação
// ---------------------------------------------------------------------------

export interface OpcoesPaginacao<T> {
  /** Como tirar os registos da página. Por defeito procura a colecção em `data`. */
  extrair?: (corpo: unknown) => T[];
  /** Total declarado pela Bolt (por defeito data.total_orders). */
  total?: (corpo: unknown) => number | undefined;
  /** Registos por página (limitado ao tecto da operação). */
  limite?: number;
  /** Travão de segurança contra ciclos infinitos. */
  maxPaginas?: number;
  /**
   * Páginas a pedir ao mesmo tempo depois de a Bolt declarar o total.
   * 1 = comportamento sequencial de sempre. Ver `paginar`.
   */
  concorrencia?: number;
}

const CHAVES_COLECAO = ["orders", "drivers", "vehicles", "logs", "state_logs"] as const;

function extrairPorDefeito<T>(corpo: unknown): T[] {
  const data = (corpo as { data?: Record<string, unknown> } | null)?.data;
  if (!data) return [];
  for (const chave of CHAVES_COLECAO) {
    const valor = data[chave];
    if (Array.isArray(valor)) return valor as T[];
  }
  return [];
}

function totalPorDefeito(corpo: unknown): number | undefined {
  const data = (corpo as { data?: Record<string, unknown> } | null)?.data;
  if (!data) return undefined;
  const total = data.total_orders ?? data.total;
  return typeof total === "number" ? total : undefined;
}

/**
 * Percorre todas as páginas de um endpoint paginado.
 *
 * Quando a Bolt declara um total (total_orders) e começámos no offset 0,
 * confirmamos no fim que trouxemos tudo — trazer menos do que o declarado é
 * dinheiro a faltar num acerto, por isso lança em vez de devolver incompleto.
 */
export async function paginar<T>(
  cred: BoltCredenciais,
  operacao: BoltOperacao,
  params: BoltParams = {},
  opcoes: OpcoesPaginacao<T> = {},
): Promise<T[]> {
  const pag = PAGINACAO[operacao];
  if (!pag) {
    throw new Error(`[bolt] ${operacao} não é um endpoint paginado`);
  }

  const limite = limitar(opcoes.limite ?? params.limit ?? pag.defeito, 1, pag.max);
  const offsetInicial = Math.max(0, Math.floor(params.offset ?? 0));
  const maxPaginas = opcoes.maxPaginas ?? 500;
  const extrair = opcoes.extrair ?? extrairPorDefeito<T>;
  const lerTotal = opcoes.total ?? totalPorDefeito;

  const concorrencia = Math.max(1, Math.floor(opcoes.concorrencia ?? 1));

  const acumulado: T[] = [];
  let totalDeclarado: number | undefined;
  let offset = offsetInicial;

  // ── Primeira página: além dos registos, diz-nos o total ──
  const primeiroCorpo = await callBolt<unknown>(cred, operacao, {
    ...params,
    limit: limite,
    offset,
  });
  const primeiros = extrair(primeiroCorpo);
  totalDeclarado = lerTotal(primeiroCorpo);
  for (const item of primeiros) acumulado.push(item);

  console.log(
    `[bolt] ${operacao}: página 1 (offset ${offset}) — ${primeiros.length} registos` +
      (typeof totalDeclarado === "number" ? `, total declarado ${totalDeclarado}` : ""),
  );

  if (primeiros.length < limite) {
    verificarTotal(operacao, acumulado.length, totalDeclarado, offsetInicial);
    return acumulado;
  }

  // ── Resto em PARALELO, quando sabemos quantas páginas faltam ──
  //
  // O custo de uma semana grande é dominado pelas idas à API, não pelo
  // tamanho de cada uma: 29 mil viagens são 30 páginas, e em fila indiana
  // isso passava dos 150 s da edge function (6 semanas da Distancia Lisboa
  // falharam assim a 2026-08-12). Sabendo o total à primeira página, os
  // offsets seguintes são todos conhecidos e não dependem uns dos outros.
  //
  // Seguro quanto a limites de débito: callBolt já repete o 429 e o 5xx com
  // backoff, honrando o Retry-After. E `verificarTotal`, no fim, continua a
  // ser a rede — trazer menos do que o declarado rebenta em vez de gravar
  // uma semana incompleta.
  if (concorrencia > 1 && typeof totalDeclarado === "number" && offsetInicial === 0) {
    const offsets: number[] = [];
    for (let o = offsetInicial + primeiros.length; o < totalDeclarado; o += limite) {
      offsets.push(o);
    }
    if (offsets.length + 1 > maxPaginas) {
      throw new Error(
        `[bolt] ${operacao}: ${offsets.length + 1} páginas passam do tecto de ${maxPaginas} — abortado.`,
      );
    }

    const paginas: T[][] = new Array(offsets.length);
    let proxima = 0;
    const trabalhador = async () => {
      for (;;) {
        const indice = proxima++;
        if (indice >= offsets.length) return;
        const corpo = await callBolt<unknown>(cred, operacao, {
          ...params,
          limit: limite,
          offset: offsets[indice],
        });
        paginas[indice] = extrair(corpo);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concorrencia, offsets.length) }, () => trabalhador()),
    );

    // Reconstituídos por ordem de offset — a ordem importa para a agregação
    // ser reproduzível entre corridas.
    for (const pagina of paginas) {
      for (const item of pagina ?? []) acumulado.push(item);
    }
    console.log(
      `[bolt] ${operacao}: +${offsets.length} páginas em paralelo (${concorrencia} a fio) — ${acumulado.length} registos`,
    );
    verificarTotal(operacao, acumulado.length, totalDeclarado, offsetInicial);
    return acumulado;
  }

  // ── Sem total declarado: fila indiana, como sempre ──
  offset += primeiros.length;
  for (let pagina = 1; pagina < maxPaginas; pagina++) {
    const corpo = await callBolt<unknown>(cred, operacao, { ...params, limit: limite, offset });
    const itens = extrair(corpo);

    const total = lerTotal(corpo);
    if (typeof total === "number") totalDeclarado = total;

    for (const item of itens) acumulado.push(item);

    console.log(
      `[bolt] ${operacao}: página ${pagina + 1} (offset ${offset}) — ${itens.length} registos, ${acumulado.length} acumulados`,
    );

    // Página incompleta = última página.
    if (itens.length < limite) {
      verificarTotal(operacao, acumulado.length, totalDeclarado, offsetInicial);
      return acumulado;
    }

    offset += itens.length;
  }

  throw new Error(
    `[bolt] ${operacao}: paginação passou das ${maxPaginas} páginas (${acumulado.length} registos) — abortado para não entrar em ciclo.`,
  );
}

function verificarTotal(
  operacao: BoltOperacao,
  trazidos: number,
  totalDeclarado: number | undefined,
  offsetInicial: number,
): void {
  // Com offset inicial > 0 o total declarado é do intervalo todo e não bate certo.
  if (offsetInicial !== 0 || totalDeclarado === undefined) return;
  if (trazidos === totalDeclarado) return;

  throw new Error(
    `[bolt] ${operacao}: a Bolt declarou ${totalDeclarado} registos mas a paginação só trouxe ${trazidos}.`,
  );
}
