// Cliente AS Connect (doc "Webservice Primavera / Asconnect", 2026-09-18).
// Sem APIs do Deno para poder ser testado em Vitest; o `fetch` é injectado.

import { precoParaProvider } from '../../supabase/functions/_shared/faturacao/totais.ts';
import {
  type DocumentoEmitido,
  lerRespostaInserir,
} from '../../supabase/functions/_shared/primavera/resposta.ts';

const TIMEOUT_PEDIDO_MS = 12_000;
const TIMEOUT_INSERIR_MS = 60_000;

// O WeGest espera 45 s desde que cria o pedido (EMIT_TIMEOUT_MS do provider) e depois diz
// ao utilizador "incerto". Os prazos contam dessa criação para o inserir acabar antes disso.
export const PRAZO_COMECAR_MS = 30_000;
export const PRAZO_INSERIR_MS = 43_000;
export const MINIMO_INSERIR_MS = 8_000;
export const MENSAGEM_NAO_EXECUTADO = 'Não executado: o WeGest já tinha deixado de esperar.';
export const MENSAGEM_SEM_TEMPO_INSERIR =
  'Não executado: já não havia tempo para o Primavera responder antes de o WeGest deixar de ' +
  'esperar. O documento não foi enviado.';

// O WeGest espera 30 s por um PDF (PDF_TIMEOUT_MS do provider); o imprimir pode passar dos 12 s
// dos outros pedidos, por isso tem prazo próprio, contado também da criação do pedido.
export const PRAZO_COMECAR_PDF_MS = 25_000;
export const PRAZO_PDF_MS = 28_000;
export const MENSAGEM_PDF_TARDE =
  'Não executado: o pedido de PDF chegou tarde e o WeGest já não ia esperar pelo ficheiro.';

/** O pedido saiu para o Primavera e não se sabe se o documento foi criado.
 *  Nunca se reporta como falha: a fila reemitiria. */
export class AmbiguoError extends Error {}

export type TipoWegest = 'FT' | 'FR' | 'NC' | 'RC';

export interface ConfigPrimavera {
  endpoint: string;
  username: string;
  password: string;
  enterprise: string;
}

export interface ConfigClientes {
  /** View do `erp/query/tabledata` onde se procura o cliente pelo NIF. */
  tabela: string;
  campo_codigo: string;
  campo_nif: string;
}

export interface ConfigAsConnect {
  primavera: ConfigPrimavera;
  /** Taxa de IVA (%) -> código interno do Primavera. */
  iva_codes: Record<string, string>;
  /** Tipo do WeGest -> TipoDocumento do Primavera (a fatura nesta instalação é "FA"). */
  tipos_documento: Partial<Record<TipoWegest, string>>;
  /** Artigo usado nas linhas que não trazem artigo próprio (o WeGest não manda nenhum). */
  artigo_por_omissao: string;
  clientes: ConfigClientes;
  /** true se o documento do Primavera espera PrecoUnit com IVA incluído (o WeGest manda sem). */
  precos_com_iva: boolean;
  /** CondPag do Primavera; sem ela o documento é recusado ("A condição de pagamento não
   *  está preenchida") quando o cliente foi criado pelo agente. Os clientes existentes usam "1". */
  condicao_pagamento: string;
}

// Tabela nativa do Primavera, confirmada no DASPWSTEST a 2026-10-13 (não há ASC_Clientes).
export const CLIENTES_POR_OMISSAO: ConfigClientes = {
  tabela: 'Clientes',
  campo_codigo: 'Cliente',
  campo_nif: 'NumContrib',
};

export const TIPOS_DOCUMENTO_POR_OMISSAO: Partial<Record<TipoWegest, string>> = { FT: 'FA' };

export const CONSUMIDOR_FINAL = '999999990';

export interface ItemEmit {
  descricao?: string;
  id_produto?: string;
  ref?: string;
  quantidade?: number;
  taxa_iva?: number;
  preco_unitario?: number;
  desconto?: number;
}

export interface ClienteEmit {
  nome?: string;
  nif?: string;
  email?: string;
  morada?: string;
  codigo_postal?: string;
  localidade?: string;
  country_code?: string;
}

export interface PayloadEmit {
  tipo?: TipoWegest;
  cliente?: ClienteEmit;
  itens?: ItemEmit[];
  observacoes?: string | null;
  referencia_externa?: string | null;
}

export type ResultadoEmit = DocumentoEmitido;

type FetchFn = typeof fetch;

export function ehEmpresaDeTeste(enterprise: string): boolean {
  return /TEST/i.test(enterprise);
}

/** Uma linha do artigo por omissão a 23%, para provar a emissão de ponta a ponta. */
export function payloadFaturaTeste(nif: string, precoSemIva: number): PayloadEmit {
  return {
    tipo: 'FT',
    cliente: { nif, nome: `Cliente teste WeGest ${nif}` },
    itens: [
      {
        descricao: 'Teste integração WeGest',
        quantidade: 1,
        taxa_iva: 23,
        preco_unitario: precoSemIva,
      },
    ],
    referencia_externa: 'TESTE-WEGEST',
  };
}

/** O AS Connect responde "Sucesso" num endpoint e "Sucesso." noutro. */
export function estadoEhSucesso(mensagem: unknown): boolean {
  if (typeof mensagem !== 'string') return false;
  return mensagem.trim().replace(/\.$/, '').toLowerCase() === 'sucesso';
}

export function extrairToken(texto: string): string | undefined {
  try {
    const parsed = JSON.parse(texto);
    if (typeof parsed === 'string') return parsed || undefined;
    return parsed?.token ?? parsed?.access_token ?? parsed?.Token ?? undefined;
  } catch {
    return texto.trim().replace(/^"|"$/g, '') || undefined;
  }
}

/** "2026-10-13T10:23:38" na hora de Lisboa — o formato do exemplo, sem fuso. */
export function dataDocLisboa(agora: Date = new Date()): string {
  return agora.toLocaleString('sv-SE', { timeZone: 'Europe/Lisbon' }).replace(' ', 'T');
}

/** Só se sabe para NIF português: 1-3 e 45 são pessoa singular, o resto colectiva. */
export function pessoaSingular(nif: string, pais: string): boolean | undefined {
  if (pais !== 'PT' || !/^\d{9}$/.test(nif)) return undefined;
  return /^[123]/.test(nif) || nif.startsWith('45');
}

/** O Primavera guarda NIF estrangeiros com o prefixo do país ("BR258209887"); o WeGest
 *  pode tê-lo com ou sem. Procurar as duas formas evita duplicar o cliente. */
export function variantesNif(nif: string, pais: string): string[] {
  const limpo = nif.replace(/\s+/g, '').toUpperCase();
  const outra = /^[A-Z]{2}/.test(limpo) ? limpo.slice(2) : `${pais}${limpo}`;
  return [...new Set([limpo, outra].filter(Boolean))];
}

/** As views devolvem nomes com capitalização mista ("artigo", "Descricao"); o SQL Server não distingue. */
export function campoSemMaiusculas(
  linha: Record<string, unknown> | undefined,
  campo: string
): unknown {
  if (!linha) return undefined;
  const chave = Object.keys(linha).find((k) => k.toLowerCase() === campo.toLowerCase());
  return chave === undefined ? undefined : linha[chave];
}

/** Instante, no relógio desta máquina, em que o WeGest criou o pedido. Com a hora do
 *  servidor mede-se a idade só com relógios do servidor: o desta máquina pode estar errado. */
export function criadoEmLocal(
  createdAt: unknown,
  servidorAgora: unknown,
  pollEnviadoEm: number
): number | undefined {
  const criado = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
  if (Number.isNaN(criado)) return undefined;
  const agoraServidor = typeof servidorAgora === 'string' ? Date.parse(servidorAgora) : NaN;
  if (Number.isNaN(agoraServidor)) return criado;
  // A hora do envio do poll, e não a da resposta, erra para o lado de desistir mais cedo.
  return pollEnviadoEm - Math.max(0, agoraServidor - criado);
}

export function podeComecar(criadoEm: number | undefined, agora: number): boolean {
  return criadoEm === undefined || agora - criadoEm <= PRAZO_COMECAR_MS;
}

/** Timeout do inserir para acabar até PRAZO_INSERIR_MS; null quando já não vale a pena enviar. */
export function timeoutDoInserir(criadoEm: number | undefined, agora: number): number | null {
  if (criadoEm === undefined) return TIMEOUT_INSERIR_MS;
  const restante = criadoEm + PRAZO_INSERIR_MS - agora;
  return restante < MINIMO_INSERIR_MS ? null : Math.min(TIMEOUT_INSERIR_MS, restante);
}

/** Timeout do imprimir para acabar até PRAZO_PDF_MS; null quando já não vale a pena pedir. */
export function timeoutDoImprimir(criadoEm: number | undefined, agora: number): number | null {
  if (criadoEm === undefined) return PRAZO_PDF_MS;
  if (agora - criadoEm > PRAZO_COMECAR_PDF_MS) return null;
  return criadoEm + PRAZO_PDF_MS - agora;
}

export interface PdfImpresso {
  base64: string;
  extensao: string;
}

/** Resposta de /documentos/vendas/imprimir com DevolvePDF (provada no servidor a 14/10/2026). */
export function lerRespostaImprimir(status: number, texto: string): PdfImpresso {
  if (status < 200 || status >= 300) {
    throw new Error(`imprimir falhou (HTTP ${status}): ${texto.slice(0, 300)}`);
  }
  let d: unknown;
  try {
    d = JSON.parse(texto);
  } catch {
    throw new Error(`imprimir: resposta não-JSON (${texto.slice(0, 300)})`);
  }
  const corpo = d && typeof d === 'object' ? (d as Record<string, unknown>) : undefined;
  const estado = campoSemMaiusculas(corpo, 'Estado');
  const mensagem =
    estado && typeof estado === 'object'
      ? campoSemMaiusculas(estado as Record<string, unknown>, 'Mensagem')
      : undefined;
  if (!estadoEhSucesso(mensagem)) {
    throw new Error(`Primavera recusou imprimir: ${String(mensagem ?? 'sem Estado')}`);
  }
  const doc = campoSemMaiusculas(corpo, 'DocGerado');
  if (typeof doc !== 'string' || !doc.trim()) {
    throw new Error('imprimir: o Primavera respondeu sem o ficheiro (DocGerado vazio).');
  }
  const ext = campoSemMaiusculas(corpo, 'ExtensaoDocGerado');
  return {
    base64: doc.trim(),
    extensao:
      typeof ext === 'string' && ext.trim() ? ext.trim().replace(/^\./, '').toUpperCase() : 'PDF',
  };
}

export interface PrazoEmit {
  /** Ver criadoEmLocal; sem ele (ex.: --fatura-teste) não há prazo. */
  criadoEm?: number;
  relogio?: () => number;
}

export function resolverCodIva(cfg: ConfigAsConnect, taxaIva: number): string {
  const code = cfg.iva_codes[String(taxaIva)];
  if (!code) {
    throw new Error(
      `Sem código de IVA mapeado para ${taxaIva}% — preenche iva_codes na configuração ` +
        'do agente antes de emitir.'
    );
  }
  return code;
}

export function construirLinhas(cfg: ConfigAsConnect, itens: ItemEmit[]) {
  if (!itens.length) throw new Error('Documento sem linhas.');
  return itens.map((it) => {
    // O campo de desconto não está documentado; largá-lo mudaria o total da fatura.
    if (Number(it.desconto) > 0) {
      throw new Error('Linhas com desconto ainda não são suportadas pelo AS Connect.');
    }
    const artigo = it.id_produto || it.ref || cfg.artigo_por_omissao;
    if (!artigo) {
      throw new Error(
        'Linha sem artigo — preenche artigo_por_omissao na configuração do agente com um ' +
          'artigo que exista no Primavera (ver --consultar ASC_Artigos).'
      );
    }
    return {
      Tipo: 'Normal',
      Artigo: artigo,
      ...(it.descricao ? { Descricao: it.descricao } : {}),
      Quantidade: String(Number(it.quantidade) || 1),
      CodIva: resolverCodIva(cfg, Number(it.taxa_iva) || 0),
      PrecoUnit: precoParaProvider(
        Number(it.preco_unitario),
        Number(it.taxa_iva),
        cfg.precos_com_iva
      ),
    };
  });
}

export function criarClienteAsConnect(cfg: ConfigAsConnect, fetchFn: FetchFn = fetch) {
  let token: string | undefined;

  async function pedido(metodo: string, caminho: string, corpo: unknown): Promise<unknown> {
    if (!token) token = await obterToken();
    const res = await fetchFn(`${cfg.primavera.endpoint}${caminho}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_PEDIDO_MS),
    });
    const texto = await res.text();
    if (!res.ok) throw new Error(`${caminho} falhou (HTTP ${res.status}): ${texto.slice(0, 300)}`);
    try {
      return JSON.parse(texto);
    } catch {
      throw new Error(`${caminho}: resposta não-JSON (${texto.slice(0, 300)})`);
    }
  }

  async function obterToken(timeoutMs: number = TIMEOUT_PEDIDO_MS): Promise<string> {
    const { username, password, enterprise } = cfg.primavera;
    const res = await fetchFn(`${cfg.primavera.endpoint}/auth/gettoken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, enterprise }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const texto = await res.text();
    if (!res.ok) throw new Error(`gettoken falhou (HTTP ${res.status}): ${texto.slice(0, 200)}`);
    const t = extrairToken(texto);
    if (!t) throw new Error(`gettoken: resposta sem token reconhecível (${texto.slice(0, 200)})`);
    return t;
  }

  async function consultar(
    tabela: string,
    opcoes: {
      colunas?: string[];
      filtros?: Array<{ field: string; operator: string; value: unknown }>;
      operadorLogico?: 'AND' | 'OR';
      pageSize?: number;
      ordenarPor?: string;
    } = {}
  ): Promise<Record<string, unknown>[]> {
    const colunas = opcoes.colunas ?? ['*'];
    const pageSize = opcoes.pageSize ?? 20;
    // O AS Connect recusa Pagination sem OrderBy ("Order by is Mandatory..."). Com "*"
    // e sem campo conhecido não há por onde ordenar: pede tudo e corta aqui.
    const ordenarPor = opcoes.ordenarPor ?? (colunas[0] !== '*' ? colunas[0] : undefined);
    const d = (await pedido('POST', '/erp/query/tabledata', {
      Query: {
        Table: tabela,
        Columns: colunas,
        Filters: opcoes.filtros ?? [],
        LogicalOperator: opcoes.operadorLogico ?? 'AND',
        ...(ordenarPor
          ? {
              OrderBy: [{ field: ordenarPor, direction: 'Asc' }],
              Pagination: { page: 1, pageSize },
            }
          : {}),
      },
    })) as { Resultado?: Record<string, unknown>[]; Estado?: { Mensagem?: string } };
    if (!estadoEhSucesso(d?.Estado?.Mensagem)) {
      throw new Error(`Consulta a ${tabela} recusada: ${d?.Estado?.Mensagem ?? 'sem Estado'}`);
    }
    return (d.Resultado ?? []).slice(0, pageSize);
  }

  /** Devolve o código Primavera do cliente com este NIF, criando-o (código = NIF) se não existir. */
  async function garantirCliente(cliente: ClienteEmit): Promise<string> {
    const nif = (cliente.nif || '').trim();
    const pais = (cliente.country_code || 'PT').toUpperCase();
    const { tabela, campo_codigo, campo_nif } = cfg.clientes;
    // Equal + OR em vez do operador In: o formato de In para texto no PDF é ambíguo.
    const linhas = await consultar(tabela, {
      colunas: [campo_codigo, 'CondPag'],
      filtros: variantesNif(nif, pais).map((v) => ({
        field: campo_nif,
        operator: 'Equal',
        value: v,
      })),
      operadorLogico: 'OR',
      pageSize: 1,
    });
    const existente = campoSemMaiusculas(linhas[0], campo_codigo);
    if (existente !== undefined && existente !== null && String(existente).trim()) {
      const codigo = String(existente).trim();
      // Um timeout no inserir do cliente pode tê-lo deixado criado sem CondPag. Só se repara
      // com a coluna presente e vazia: sem ela não se sabe e não se mexe num cliente real.
      const condPag = campoSemMaiusculas(linhas[0], 'CondPag');
      if (condPag === null || (typeof condPag === 'string' && !condPag.trim())) {
        await gravarCondPag(codigo);
      }
      return codigo;
    }

    const singular = pessoaSingular(nif, pais);
    const d = (await pedido('POST', '/ficha/cliente/inserir', {
      Cliente: {
        Codigo: nif,
        Nome: cliente.nome || nif,
        NIF: nif,
        ...(cliente.morada ? { Morada1: cliente.morada } : {}),
        ...(cliente.localidade ? { Localidade: cliente.localidade } : {}),
        ...(cliente.codigo_postal ? { CodPostal: cliente.codigo_postal } : {}),
        ...(cliente.email ? { Email: cliente.email } : {}),
        Moeda: 'EUR',
        ...(pais === 'PT' ? { Idioma: 'PT' } : {}),
        Pais: pais,
        ...(singular !== undefined ? { PessoaSingular: singular } : {}),
      },
    })) as { CodCliente?: string; Estado?: { Mensagem?: string } };
    if (!estadoEhSucesso(d?.Estado?.Mensagem)) {
      throw new Error(
        `Primavera recusou criar o cliente ${nif}: ${d?.Estado?.Mensagem ?? 'sem Estado'}`
      );
    }
    const codigo = String(d.CodCliente || nif);
    await gravarCondPag(codigo);
    return codigo;
  }

  // O inserir do cliente ignora CondPag (confirmado no DASPWSTEST a 2026-10-13) e sem ela a
  // fatura é recusada; o atualizar aceita-a.
  async function gravarCondPag(codigo: string): Promise<void> {
    const a = (await pedido('PUT', '/ficha/cliente/atualizar', {
      Cliente: { Codigo: codigo, CondPag: cfg.condicao_pagamento },
    })) as { Estado?: { Mensagem?: string } };
    if (!estadoEhSucesso(a?.Estado?.Mensagem)) {
      throw new Error(
        `Cliente ${codigo} sem condição de pagamento: ${a?.Estado?.Mensagem ?? 'sem Estado'}`
      );
    }
  }

  async function emitir(
    payload: PayloadEmit,
    agora: Date = new Date(),
    prazo: PrazoEmit = {}
  ): Promise<ResultadoEmit> {
    const tipo = payload.tipo ?? 'FT';
    const tipoDocumento = cfg.tipos_documento[tipo];
    if (!tipoDocumento) {
      throw new Error(`Sem TipoDocumento do Primavera para ${tipo} — preenche tipos_documento.`);
    }
    const cliente = payload.cliente ?? {};
    const nif = (cliente.nif || '').trim();
    if (!nif || nif === CONSUMIDOR_FINAL) {
      throw new Error('Cliente sem NIF — emissão para consumidor final não está documentada.');
    }
    // Validar as linhas antes de criar o cliente: uma config incompleta não deve deixar fichas soltas.
    const linhas = construirLinhas(cfg, payload.itens ?? []);
    const entidade = await garantirCliente(cliente);

    const observacoes = [payload.observacoes, payload.referencia_externa]
      .filter((v): v is string => typeof v === 'string' && !!v.trim())
      .join(' | ');

    if (!token) token = await obterToken();
    const timeoutInserir = timeoutDoInserir(prazo.criadoEm, (prazo.relogio ?? Date.now)());
    if (timeoutInserir === null) throw new Error(MENSAGEM_SEM_TEMPO_INSERIR);
    // Daqui em diante o pedido pode ter chegado: corte de rede, timeout, 5xx ou resposta
    // sem forma são ambíguos (o documento pode existir), nunca falha.
    let status: number;
    let texto: string;
    try {
      const res = await fetchFn(`${cfg.primavera.endpoint}/documentos/vendas/inserir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          Documento: {
            TipoDocumento: tipoDocumento,
            CondPag: cfg.condicao_pagamento,
            Entidade: entidade,
            DataDoc: dataDocLisboa(agora),
            ...(payload.referencia_externa ? { Referencia: payload.referencia_externa } : {}),
            ...(observacoes ? { Observacoes: observacoes } : {}),
            Linhas: linhas,
          },
        }),
        signal: AbortSignal.timeout(timeoutInserir),
      });
      status = res.status;
      texto = await res.text();
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      throw new AmbiguoError(
        `inserir documento: a ligação caiu depois de o pedido sair (${msg}). O documento pode ter sido criado.`
      );
    }
    const leitura = lerRespostaInserir(status, texto, tipoDocumento);
    if (leitura.tipo === 'recusado') throw new Error(leitura.mensagem);
    if (leitura.tipo === 'ambiguo') throw new AmbiguoError(leitura.mensagem);
    return leitura.documento;
  }

  /** Token + uma leitura à BD: prova que o AS Connect chega à empresa, não só que autentica. */
  async function testar(): Promise<{ ok: true; artigo_por_omissao_existe?: boolean }> {
    if (!cfg.artigo_por_omissao) {
      await consultar('ASC_Artigos', { colunas: ['artigo'], pageSize: 1 });
      return { ok: true };
    }
    const r = await consultar('ASC_Artigos', {
      colunas: ['artigo'],
      filtros: [{ field: 'artigo', operator: 'Equal', value: cfg.artigo_por_omissao }],
      pageSize: 1,
    });
    if (!r.length) {
      throw new Error(`O artigo_por_omissao "${cfg.artigo_por_omissao}" não existe no Primavera.`);
    }
    return { ok: true, artigo_por_omissao_existe: true };
  }

  /** PDF de um documento já emitido. Sem efeito fiscal: qualquer falha é só falha. O
   *  `timeoutMs` cobre o token e a impressão, para acabar dentro do que o WeGest espera. */
  async function imprimir(
    tipoDocumento: string,
    serie: string,
    numero: string,
    timeoutMs: number,
    relogio: () => number = Date.now
  ): Promise<PdfImpresso> {
    const fim = relogio() + timeoutMs;
    if (!token) token = await obterToken(Math.max(1, Math.min(TIMEOUT_PEDIDO_MS, fim - relogio())));
    const restante = fim - relogio();
    if (restante <= 0)
      throw new Error('imprimir: sem tempo para pedir o PDF depois da autenticação.');
    let status: number;
    let texto: string;
    try {
      const res = await fetchFn(`${cfg.primavera.endpoint}/documentos/vendas/imprimir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          Documento: { TipoDocumento: tipoDocumento, Serie: serie, NumeroDoc: numero },
          Impressao: { DevolvePDF: true },
        }),
        signal: AbortSignal.timeout(restante),
      });
      status = res.status;
      texto = await res.text();
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      throw new Error(`imprimir: sem resposta do Primavera (${msg}).`);
    }
    return lerRespostaImprimir(status, texto);
  }

  return { pedido, obterToken, consultar, garantirCliente, emitir, testar, imprimir };
}
