/**
 * Integração KeyInvoice API 5.0
 * https://login.keyinvoice.com/API5.php
 */

import type {
  CreateFaturaPayload,
  FaturaResponse,
  KeyInvoiceRequest,
  TipoFatura,
} from '@/types/keyinvoice';

export type { FaturaResponse, CreateFaturaPayload, TipoFatura };

const API_URL = 'https://login.keyinvoice.com/API5.php';
const API_KEY = import.meta.env.VITE_KEYINVOICE_API_KEY;

if (!API_KEY) {
  console.warn('⚠️ VITE_KEYINVOICE_API_KEY não configurada. Integração KeyInvoice desabilitada.');
}

interface KeyInvoiceErrorResponse {
  erro?: string;
  erro_code?: string;
  [key: string]: unknown;
}

export class KeyInvoiceError extends Error {
  constructor(
    public statusCode: number,
    public body: unknown
  ) {
    super(`KeyInvoice API Error: ${statusCode}`);
    this.name = 'KeyInvoiceError';
  }
}

/**
 * Chamada genérica à API KeyInvoice.
 * A API espera um body em forma urlencoded com chave de autenticação.
 */
async function callKeyInvoiceAPI(payload: Record<string, unknown>): Promise<unknown> {
  if (!API_KEY) {
    throw new Error('KeyInvoice API key não configurada');
  }

  const body = new URLSearchParams();
  body.append('api_key', API_KEY);

  // Serializar payload em formato urlencoded (flat ou nested conforme KeyInvoice espera)
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object') {
        body.append(key, JSON.stringify(value));
      } else {
        body.append(key, String(value));
      }
    }
  });

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new KeyInvoiceError(response.status, await response.text());
    }

    const data = await response.json();

    // KeyInvoice retorna erro como campo "erro" no JSON
    if ((data as KeyInvoiceErrorResponse).erro) {
      throw new KeyInvoiceError(400, data);
    }

    return data;
  } catch (error) {
    if (error instanceof KeyInvoiceError) {
      throw error;
    }
    throw new Error(
      `KeyInvoice API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Criar documento (Fatura, Fatura-Recibo ou Nota de Crédito).
 */
export async function createFatura(payload: CreateFaturaPayload): Promise<FaturaResponse> {
  const tipoMap: Record<TipoFatura, string> = {
    FT: 'FT', // Fatura
    FR: 'FR', // Fatura-Recibo
    NC: 'NC', // Nota de Crédito
  };

  const request: KeyInvoiceRequest = {
    m: 'create_document',
    tipo_documento: tipoMap[payload.tipo],
    cliente: {
      nome: payload.cliente_nome,
      nif: payload.cliente_nif,
      email: payload.cliente_email,
      morada: payload.cliente_morada,
      codigo_postal: payload.cliente_codigo_postal,
      localidade: payload.cliente_localidade,
      pais: payload.cliente_pais || 'Portugal',
    },
    data_emissao: payload.data || new Date().toISOString().split('T')[0],
    itens: payload.itens.map((item) => ({
      descricao: item.descricao,
      quantidade: item.quantidade,
      valor_unitario: item.preco_unitario,
      taxa_iva: item.taxa_iva,
    })),
    observacoes: payload.observacoes,
    referencia_externa: payload.referencia_externa,
    documento_referencia: payload.fatura_original_id,
  };

  const result = await callKeyInvoiceAPI(request as Record<string, unknown>);

  // Normalizar resposta (KeyInvoice pode retornar em formatos variáveis)
  return normalizeFaturaResponse(result);
}

/**
 * Obter PDF de um documento criado.
 */
export async function getFaturaPDF(numeroFatura: string, serie: string = ''): Promise<Blob> {
  const request: KeyInvoiceRequest = {
    m: 'get_document_pdf',
    numero_documento: numeroFatura,
    serie_documento: serie,
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      api_key: API_KEY || '',
      ...Object.fromEntries(Object.entries(request).map(([k, v]) => [k, String(v || '')])),
    }).toString(),
  });

  if (!response.ok) {
    throw new KeyInvoiceError(response.status, await response.text());
  }

  return response.blob();
}

/**
 * Normalizar resposta da API KeyInvoice para formato padrão.
 */
function normalizeFaturaResponse(data: unknown): FaturaResponse {
  const response = data as Record<string, unknown>;

  return {
    id: (response.id || response.document_id || '') as string,
    numero: (response.numero || response.numero_documento || '') as string,
    serie: (response.serie || response.serie_documento || 'FT') as string,
    data: (response.data ||
      response.data_emissao ||
      new Date().toISOString().split('T')[0]) as string,
    url_pdf: (response.url_pdf || response.pdf_url || '') as string,
    status: (response.status || 'created') as string,
    total: Number(response.total || response.valor_total || 0),
  };
}

/**
 * Health check: verificar se API está acessível.
 */
export async function checkKeyInvoiceHealth(): Promise<boolean> {
  try {
    if (!API_KEY) return false;

    const result = await callKeyInvoiceAPI({ m: 'ping' });
    return !!(result as Record<string, unknown>).status;
  } catch {
    return false;
  }
}
