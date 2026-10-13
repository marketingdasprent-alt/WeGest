// Cliente AS Connect (doc "Webservice Primavera / Asconnect", 2026-09-18).
// Sem APIs do Deno para poder ser testado em Vitest; o `fetch` é injectado.

import { precoParaProvider } from '../../supabase/functions/_shared/faturacao/totais.ts';

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

export interface ResultadoEmit {
  doctype: string;
  docnum: string;
  serie: string;
  numero: string;
  raw: unknown;
}

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
    });
    const texto = await res.text();
    if (!res.ok) throw new Error(`${caminho} falhou (HTTP ${res.status}): ${texto.slice(0, 300)}`);
    try {
      return JSON.parse(texto);
    } catch {
      throw new Error(`${caminho}: resposta não-JSON (${texto.slice(0, 300)})`);
    }
  }

  async function obterToken(): Promise<string> {
    const { username, password, enterprise } = cfg.primavera;
    const res = await fetchFn(`${cfg.primavera.endpoint}/auth/gettoken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, enterprise }),
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
      colunas: [campo_codigo],
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
      return String(existente).trim();
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
    // O inserir ignora CondPag (confirmado no DASPWSTEST a 2026-10-13) e sem ela a fatura é
    // recusada; o atualizar aceita-a.
    const a = (await pedido('PUT', '/ficha/cliente/atualizar', {
      Cliente: { Codigo: codigo, CondPag: cfg.condicao_pagamento },
    })) as { Estado?: { Mensagem?: string } };
    if (!estadoEhSucesso(a?.Estado?.Mensagem)) {
      throw new Error(
        `Cliente ${codigo} criado, mas sem condição de pagamento: ${a?.Estado?.Mensagem ?? 'sem Estado'}`
      );
    }
    return codigo;
  }

  async function emitir(payload: PayloadEmit, agora: Date = new Date()): Promise<ResultadoEmit> {
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

    const d = (await pedido('POST', '/documentos/vendas/inserir', {
      Documento: {
        TipoDocumento: tipoDocumento,
        CondPag: cfg.condicao_pagamento,
        Entidade: entidade,
        DataDoc: dataDocLisboa(agora),
        ...(payload.referencia_externa ? { Referencia: payload.referencia_externa } : {}),
        ...(observacoes ? { Observacoes: observacoes } : {}),
        Linhas: linhas,
      },
    })) as {
      TipoDocGerado?: string;
      SerieDocGerado?: string;
      NumeroDocGerado?: string | number;
      Documento?: string;
      Estado?: { Mensagem?: string };
    };
    if (!estadoEhSucesso(d?.Estado?.Mensagem)) {
      throw new Error(`Primavera recusou: ${d?.Estado?.Mensagem ?? 'sem Estado'}`);
    }
    if (!d.NumeroDocGerado) throw new Error('Resposta sem NumeroDocGerado.');

    const doctype = d.TipoDocGerado || tipoDocumento;
    const serie = String(d.SerieDocGerado ?? '');
    return {
      doctype,
      docnum: String(d.NumeroDocGerado),
      serie,
      numero: d.Documento || `${doctype} ${serie}/${d.NumeroDocGerado}`,
      raw: d,
    };
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

  return { pedido, obterToken, consultar, garantirCliente, emitir, testar };
}
