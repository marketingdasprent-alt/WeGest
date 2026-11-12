import type { ConfigAsConnect } from './asconnect.ts';
import { CLIENTES_POR_OMISSAO } from './asconnect.ts';

export const cfgBase: ConfigAsConnect = {
  primavera: { endpoint: 'http://srv:8090', username: 'u', password: 'p', enterprise: 'E' },
  iva_codes: { '23': '01', '0': '04' },
  tipos_documento: { FT: 'FA' },
  artigo_por_omissao: 'ALUGUER',
  clientes: CLIENTES_POR_OMISSAO,
  precos_com_iva: false,
  condicao_pagamento: '1',
};

export interface Chamada {
  url: string;
  corpo: any;
}

/** fetch falso: devolve, por caminho, a resposta indicada e regista o corpo enviado. */
export function fetchFalso(respostas: Record<string, unknown[]>) {
  const chamadas: Chamada[] = [];
  const fila = Object.fromEntries(Object.entries(respostas).map(([k, v]) => [k, [...v]]));
  const fn = (async (url: string, init?: RequestInit) => {
    const caminho = url.replace('http://srv:8090', '');
    chamadas.push({ url: caminho, corpo: init?.body ? JSON.parse(String(init.body)) : null });
    const r = fila[caminho]?.shift();
    if (r === undefined) throw new Error(`pedido inesperado: ${caminho}`);
    return new Response(typeof r === 'string' ? r : JSON.stringify(r), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, chamadas };
}

/** Chamadas sem a leitura do total (CabecDoc), que vem depois do inserir. */
export const semLeituraTotal = (chamadas: Chamada[]) =>
  chamadas.filter((c) => c.corpo?.Query?.Table !== 'CabecDoc');

export const SUCESSO = { Estado: { Mensagem: 'Sucesso' } };
export const DOC_OK = {
  TipoDocGerado: 'FA',
  SerieDocGerado: '2026',
  NumeroDocGerado: '68',
  Documento: 'FA 2026/68',
  ...SUCESSO,
};
export const payload = {
  tipo: 'FT' as const,
  cliente: { nome: 'Ana', nif: '234567890', morada: 'Rua A' },
  itens: [{ descricao: 'Aluguer semana 41', quantidade: 1, taxa_iva: 23, preco_unitario: 100 }],
  referencia_externa: 'CTR-12',
};
