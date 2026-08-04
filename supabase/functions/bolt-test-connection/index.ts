import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  BoltApiError,
  type BoltCredenciais,
  callBolt,
  limparCacheTokens,
  listarEmpresas,
  obterToken,
  type RespostaFleetOrders,
  validadeTokenSegundos,
} from "../_shared/bolt/client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Teste de ligação à API de frota da Bolt (OAuth2 client_credentials).
 *
 * É o que corre quando o utilizador cola a chave e carrega em "Testar ligação",
 * portanto tem de responder a três perguntas concretas:
 *   1. as credenciais são válidas e quanto tempo dura o token;
 *   2. QUE EMPRESAS é que esta credencial cobre (getCompanies) — é o dado que
 *      decide se um par de credenciais chega para as 6 empresas ou se é preciso
 *      um par por empresa;
 *   3. se for indicado um company_id, se ele está nessa lista e se as
 *      permissões chegam mesmo para ler viagens e motoristas (sondagem real).
 *
 * Recebe as credenciais no corpo do pedido e NUNCA lê nem escreve na BD — é
 * chamado antes de a integração existir. (IntegracaoDetailModal envia também
 * integracao_id; é aceite e ignorado.)
 *
 * PRIVACIDADE: as respostas da Bolt trazem moradas e telefones de passageiros e
 * motoristas. Nada do corpo vai para log nem para a resposta — só contagens,
 * nome da empresa e códigos de erro.
 */

/** Janela da sondagem: últimos 7 dias. Curta que chegue para ser barata. */
const JANELA_SONDA_SEGUNDOS = 7 * 24 * 3600;

/** Quantos company_ids listar nas mensagens antes de cortar. */
const MAX_IDS_NA_MENSAGEM = 20;

/**
 * Códigos estáveis para a UI decidir o que mostrar sem fazer parsing da
 * mensagem. A mensagem é para o humano; o código é para o código.
 */
type CodigoTeste =
  | "OK"
  | "PEDIDO_MAL_FORMADO"
  | "CREDENCIAIS_EM_FALTA"
  | "COMPANY_ID_INVALIDO"
  | "CREDENCIAIS_INVALIDAS"
  | "BOLT_INDISPONIVEL"
  | "SEM_EMPRESAS"
  | "EMPRESA_SEM_ACESSO"
  | "EMPRESA_INACTIVA"
  | "INTERVALO_INVALIDO"
  | "PEDIDO_INVALIDO"
  | "ERRO_BOLT"
  | "ERRO_INTERNO";

type EstadoPasso = "ok" | "falhou" | "ignorado";

interface Verificacao {
  passo: string;
  estado: EstadoPasso;
  detalhe: string;
}

interface RespostaTeste {
  success: boolean;
  message: string;
  error: string | null;
  codigo: CodigoTeste;
  auth: { valida: boolean; token_expires_in: number | null };
  /** Mantido ao nível de topo por compatibilidade com o contrato anterior. */
  token_expires_in: number | null;
  empresas: { total: number; company_ids: number[] };
  /** Atalho para o dado mais importante do teste. */
  company_ids: number[];
  company:
    | {
      company_id: number;
      company_name: string | null;
      total_orders: number | null;
      na_lista: boolean;
    }
    | null;
  drivers: { acessivel: boolean; amostra: number; erro: string | null } | null;
  verificacoes: Verificacao[];
  avisos: string[];
  duracao_ms: number;
}

/**
 * Responde SEMPRE com HTTP 200, mesmo em falha. O supabase-js trata qualquer
 * não-2xx como FunctionsHttpError e deita fora o corpo — o utilizador ficaria
 * com "Edge Function returned a non-2xx status code" em vez do diagnóstico.
 * O sucesso/insucesso vai em `success`, como no brevo/via-verde-test-connection.
 */
function responder(corpo: RespostaTeste): Response {
  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function respostaBase(inicio: number): RespostaTeste {
  return {
    success: false,
    message: "",
    error: null,
    codigo: "ERRO_INTERNO",
    auth: { valida: false, token_expires_in: null },
    token_expires_in: null,
    empresas: { total: 0, company_ids: [] },
    company_ids: [],
    company: null,
    drivers: null,
    verificacoes: [],
    avisos: [],
    duracao_ms: Date.now() - inicio,
  };
}

function falhar(
  resposta: RespostaTeste,
  codigo: CodigoTeste,
  mensagem: string,
  inicio: number,
): Response {
  resposta.success = false;
  resposta.codigo = codigo;
  resposta.error = mensagem;
  resposta.message = mensagem;
  resposta.duracao_ms = Date.now() - inicio;
  return responder(resposta);
}

function listarIds(ids: number[]): string {
  if (ids.length === 0) return "nenhuma";
  const mostrados = ids.slice(0, MAX_IDS_NA_MENSAGEM).join(", ");
  return ids.length > MAX_IDS_NA_MENSAGEM
    ? `${mostrados} (+${ids.length - MAX_IDS_NA_MENSAGEM})`
    : mostrados;
}

/**
 * A autenticação falha antes de haver corpo da Bolt para inspeccionar, por isso
 * o único sinal é o estado HTTP que o cliente põe na mensagem. Distinguir
 * "a Bolt recusou a chave" de "a Bolt não respondeu" é a diferença entre o
 * utilizador ir buscar credenciais novas ou simplesmente voltar a tentar.
 */
function classificarErroAuth(erro: unknown): { codigo: CodigoTeste; mensagem: string } {
  const texto = erro instanceof Error ? erro.message : String(erro);
  const estado = Number(texto.match(/HTTP (\d{3})/)?.[1] ?? Number.NaN);

  if (estado === 400 || estado === 401 || estado === 403) {
    return {
      codigo: "CREDENCIAIS_INVALIDAS",
      mensagem:
        `Credenciais inválidas: a Bolt recusou este par Client ID / Client Secret (HTTP ${estado}). ` +
        "Confirme que a chave foi copiada da secção Fleet Integration do portal Bolt, sem espaços, e que ainda não foi revogada.",
    };
  }

  if (Number.isFinite(estado)) {
    return {
      codigo: "BOLT_INDISPONIVEL",
      mensagem:
        `O serviço de autenticação da Bolt respondeu HTTP ${estado}. As credenciais podem estar certas — ` +
        "é uma falha do lado da Bolt. Volte a tentar dentro de alguns minutos.",
    };
  }

  return {
    codigo: "BOLT_INDISPONIVEL",
    mensagem: `Não foi possível contactar o serviço de autenticação da Bolt: ${texto}`,
  };
}

/**
 * Traduz um erro de uma chamada à API. Os erros de negócio chegam com HTTP 200
 * no corpo e são apanhados pelo assertBoltOk do cliente partilhado, que os
 * relança como BoltApiError — é onde estão os códigos que interessam ao
 * utilizador (sem acesso à empresa, empresa inactiva, ...).
 */
function classificarErroApi(
  erro: unknown,
  companyId: number | null,
): { codigo: CodigoTeste; mensagem: string } {
  if (erro instanceof BoltApiError) {
    const empresa = companyId !== null ? `a empresa ${companyId}` : "esta empresa";

    switch (erro.codigo) {
      case 498810:
        return {
          codigo: "EMPRESA_SEM_ACESSO",
          mensagem:
            `Credenciais válidas, mas sem acesso a ${empresa} (COMPANY_NOT_ALLOWED). ` +
            "Peça à Bolt para associar esta empresa a estas credenciais, ou use o par de credenciais próprio da empresa.",
        };
      case 498809:
        return {
          codigo: "EMPRESA_INACTIVA",
          mensagem:
            `Credenciais válidas e com acesso, mas ${empresa} está inactiva na Bolt (COMPANY_NOT_ACTIVE). ` +
            "A sincronização só vai funcionar depois de a Bolt reactivar a frota.",
        };
      case 498805:
      case 498806:
        return {
          codigo: "INTERVALO_INVALIDO",
          mensagem:
            `A Bolt recusou o intervalo de datas da sondagem (${erro.codigoNome ?? erro.codigo}). ` +
            "Isto é um problema do WeGest, não das credenciais — comunique ao suporte.",
        };
      case 702:
        return {
          codigo: "PEDIDO_INVALIDO",
          mensagem:
            `A Bolt rejeitou o pedido como inválido (INVALID_REQUEST): ${erro.message}. ` +
            "Confirme o Company ID.",
        };
      default:
        return {
          codigo: "ERRO_BOLT",
          mensagem: erro.message,
        };
    }
  }

  const texto = erro instanceof Error ? erro.message : String(erro);
  return {
    codigo: "BOLT_INDISPONIVEL",
    mensagem: `Falha na comunicação com a API da Bolt: ${texto}`,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const inicio = Date.now();
  const resposta = respostaBase(inicio);

  let corpoPedido: Record<string, unknown>;
  try {
    const analisado = await req.json();
    if (!analisado || typeof analisado !== "object" || Array.isArray(analisado)) {
      throw new Error("corpo não é um objecto");
    }
    corpoPedido = analisado as Record<string, unknown>;
  } catch {
    return falhar(resposta, "PEDIDO_MAL_FORMADO", "Corpo do pedido inválido (JSON esperado).", inicio);
  }

  // Espaços em branco colados junto com a chave são a causa nº1 de "credenciais
  // inválidas" que afinal estão certas.
  const clientId = typeof corpoPedido.client_id === "string" ? corpoPedido.client_id.trim() : "";
  const clientSecret = typeof corpoPedido.client_secret === "string"
    ? corpoPedido.client_secret.trim()
    : "";

  if (!clientId || !clientSecret) {
    return falhar(
      resposta,
      "CREDENCIAIS_EM_FALTA",
      "Client ID e Client Secret são obrigatórios.",
      inicio,
    );
  }

  // company_id é opcional; a UI manda-o como texto.
  let companyId: number | null = null;
  const companyIdBruto = corpoPedido.company_id;
  if (companyIdBruto !== undefined && companyIdBruto !== null && String(companyIdBruto).trim() !== "") {
    const numero = Number(String(companyIdBruto).trim());
    if (!Number.isInteger(numero) || numero <= 0) {
      return falhar(
        resposta,
        "COMPANY_ID_INVALIDO",
        `Company ID inválido: "${String(companyIdBruto)}". Tem de ser o número inteiro que a Bolt atribui à frota.`,
        inicio,
      );
    }
    companyId = numero;
  }

  const cred: BoltCredenciais = { clientId, clientSecret };

  // Um teste de ligação tem de ligar mesmo: sem isto, um token em cache de uma
  // invocação anterior podia dar "válido" a um secret entretanto trocado.
  limparCacheTokens(clientId);

  try {
    console.log(`[bolt-test] início (company_id: ${companyId ?? "não indicado"})`);

    // ---------------------------------------------------------------------
    // 1. Autenticação
    // ---------------------------------------------------------------------
    try {
      await obterToken(cred);
    } catch (erro) {
      const { codigo, mensagem } = classificarErroAuth(erro);
      console.error(`[bolt-test] autenticação falhou: ${codigo}`);
      resposta.verificacoes.push({ passo: "autenticacao", estado: "falhou", detalhe: mensagem });
      return falhar(resposta, codigo, mensagem, inicio);
    }

    const validade = validadeTokenSegundos(clientId);
    resposta.auth = { valida: true, token_expires_in: validade };
    resposta.token_expires_in = validade;
    resposta.verificacoes.push({
      passo: "autenticacao",
      estado: "ok",
      detalhe: validade !== null
        ? `Token obtido, válido por ${validade}s.`
        : "Token obtido.",
    });
    console.log(`[bolt-test] token obtido (validade ${validade ?? "?"}s)`);

    // ---------------------------------------------------------------------
    // 2. getCompanies — que empresas é que esta credencial cobre
    // ---------------------------------------------------------------------
    let ids: number[];
    try {
      ids = await listarEmpresas(cred);
    } catch (erro) {
      const { codigo, mensagem } = classificarErroApi(erro, null);
      console.error(`[bolt-test] getCompanies falhou: ${codigo}`);
      resposta.verificacoes.push({ passo: "getCompanies", estado: "falhou", detalhe: mensagem });
      return falhar(
        resposta,
        codigo,
        `As credenciais autenticam mas a listagem de empresas falhou. ${mensagem}`,
        inicio,
      );
    }

    resposta.empresas = { total: ids.length, company_ids: ids };
    resposta.company_ids = ids;
    resposta.verificacoes.push({
      passo: "getCompanies",
      estado: ids.length > 0 ? "ok" : "falhou",
      detalhe: `${ids.length} empresa(s): ${listarIds(ids)}`,
    });

    if (ids.length === 0) {
      return falhar(
        resposta,
        "SEM_EMPRESAS",
        "Credenciais válidas, mas não estão associadas a nenhuma empresa na Bolt. " +
          "Peça à Bolt para associar as frotas a estas credenciais.",
        inicio,
      );
    }

    // ---------------------------------------------------------------------
    // 3. Sem company_id não há mais nada a validar — mas a lista já é o
    //    essencial: diz se um par de credenciais chega para todas as empresas.
    // ---------------------------------------------------------------------
    if (companyId === null) {
      resposta.verificacoes.push({
        passo: "empresa_na_lista",
        estado: "ignorado",
        detalhe: "Company ID não indicado.",
      });
      resposta.verificacoes.push({
        passo: "getFleetOrders",
        estado: "ignorado",
        detalhe: "Company ID não indicado.",
      });
      resposta.verificacoes.push({
        passo: "getDrivers",
        estado: "ignorado",
        detalhe: "Company ID não indicado.",
      });
      resposta.avisos.push(
        "Indique o Company ID para validar também as permissões de leitura de viagens e motoristas.",
      );
      resposta.success = true;
      resposta.codigo = "OK";
      resposta.message =
        `Credenciais válidas — acesso a ${ids.length} empresa(s): ${listarIds(ids)}.`;
      resposta.duracao_ms = Date.now() - inicio;
      return responder(resposta);
    }

    const naLista = ids.includes(companyId);
    resposta.company = {
      company_id: companyId,
      company_name: null,
      total_orders: null,
      na_lista: naLista,
    };
    resposta.verificacoes.push({
      passo: "empresa_na_lista",
      estado: naLista ? "ok" : "falhou",
      detalhe: naLista
        ? `A empresa ${companyId} está na lista da credencial.`
        : `A empresa ${companyId} NÃO está na lista da credencial.`,
    });

    if (!naLista) {
      return falhar(
        resposta,
        "EMPRESA_SEM_ACESSO",
        `Credenciais válidas, mas não dão acesso à empresa ${companyId}. ` +
          `Esta chave cobre: ${listarIds(ids)}. ` +
          "Corrija o Company ID ou use o par de credenciais próprio desta empresa.",
        inicio,
      );
    }

    // ---------------------------------------------------------------------
    // 4. Sondagem real a getFleetOrders (company_ids ARRAY, tratado pelo
    //    cliente partilhado). Estar na lista não garante permissão de leitura.
    // ---------------------------------------------------------------------
    const fim = Math.floor(Date.now() / 1000);
    const comeco = fim - JANELA_SONDA_SEGUNDOS;

    let dadosViagens: RespostaFleetOrders["data"] | undefined;
    try {
      const corpo = await callBolt<RespostaFleetOrders>(cred, "getFleetOrders", {
        company_id: companyId,
        start_ts: comeco,
        end_ts: fim,
        limit: 1,
        offset: 0,
      });
      dadosViagens = corpo?.data;
    } catch (erro) {
      const { codigo, mensagem } = classificarErroApi(erro, companyId);
      console.error(`[bolt-test] getFleetOrders falhou: ${codigo}`);
      resposta.verificacoes.push({ passo: "getFleetOrders", estado: "falhou", detalhe: mensagem });
      resposta.verificacoes.push({
        passo: "getDrivers",
        estado: "ignorado",
        detalhe: "Não testado — a leitura de viagens falhou primeiro.",
      });
      return falhar(resposta, codigo, mensagem, inicio);
    }

    const nomeEmpresa = typeof dadosViagens?.company_name === "string"
      ? dadosViagens.company_name
      : null;
    const totalViagens = typeof dadosViagens?.total_orders === "number"
      ? dadosViagens.total_orders
      : null;

    resposta.company = {
      company_id: companyId,
      company_name: nomeEmpresa,
      total_orders: totalViagens,
      na_lista: true,
    };
    resposta.verificacoes.push({
      passo: "getFleetOrders",
      estado: "ok",
      detalhe: `${totalViagens ?? 0} viagem(ns) nos últimos 7 dias.`,
    });
    console.log(`[bolt-test] getFleetOrders ok (${totalViagens ?? 0} viagens em 7 dias)`);

    // ---------------------------------------------------------------------
    // 5. Sondagem a getDrivers (company_id SINGULAR — o cliente partilhado
    //    normaliza; mandar array aqui dava 702 INVALID_REQUEST).
    //    Falhar só aqui não invalida a integração: as viagens (o dinheiro) já
    //    estão confirmadas. Fica como aviso.
    // ---------------------------------------------------------------------
    try {
      const corpo = await callBolt<{ data?: { drivers?: unknown[] } }>(cred, "getDrivers", {
        company_id: companyId,
        start_ts: comeco,
        end_ts: fim,
        limit: 1,
        offset: 0,
      });
      const amostra = Array.isArray(corpo?.data?.drivers) ? corpo.data.drivers.length : 0;
      resposta.drivers = { acessivel: true, amostra, erro: null };
      resposta.verificacoes.push({
        passo: "getDrivers",
        estado: "ok",
        detalhe: amostra > 0
          ? "Leitura de motoristas confirmada."
          : "Leitura de motoristas confirmada (sem motoristas no período).",
      });
      console.log(`[bolt-test] getDrivers ok (amostra: ${amostra})`);
    } catch (erro) {
      const { mensagem } = classificarErroApi(erro, companyId);
      console.error("[bolt-test] getDrivers falhou");
      resposta.drivers = { acessivel: false, amostra: 0, erro: mensagem };
      resposta.verificacoes.push({ passo: "getDrivers", estado: "falhou", detalhe: mensagem });
      resposta.avisos.push(
        `As viagens são acessíveis mas a leitura de motoristas falhou: ${mensagem} ` +
          "O mapeamento automático de motoristas não vai funcionar.",
      );
    }

    resposta.success = true;
    resposta.codigo = "OK";
    resposta.message = `Ligado a ${nomeEmpresa ?? `empresa ${companyId}`} — ` +
      `${totalViagens ?? 0} viagem(ns) nos últimos 7 dias. ` +
      `A credencial cobre ${ids.length} empresa(s): ${listarIds(ids)}.`;
    resposta.duracao_ms = Date.now() - inicio;
    return responder(resposta);
  } catch (erro) {
    const texto = erro instanceof Error ? erro.message : String(erro);
    console.error(`[bolt-test] erro inesperado: ${texto}`);
    return falhar(resposta, "ERRO_INTERNO", `Erro ao testar a ligação: ${texto}`, inicio);
  } finally {
    // O token deriva de credenciais que podem nem chegar a ser gravadas — não
    // fica a viver na memória do isolate depois do teste.
    limparCacheTokens(clientId);
  }
});
