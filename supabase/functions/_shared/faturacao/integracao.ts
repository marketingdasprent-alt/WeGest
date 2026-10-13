// Leitura de uma linha de `plataformas_configuracao` (plataforma='faturacao').
// TS puro, sem APIs de Deno: usado pela edge function faturacao-emitir e
// testado pelo Vitest (src/lib/integracaoFaturacao.test.ts).

import { PROVIDERS_CONHECIDOS } from './escolha.ts';

export interface LinhaIntegracao {
  id: string;
  client_secret: string | null;
  config: Record<string, unknown> | null;
}

export interface ConfigIntegracao {
  integracaoId: string;
  provider: string;
  apiKey: string | null;
  settings: Record<string, unknown> | null;
}

export const PROVIDER_POR_OMISSAO = 'keyinvoice';

export function configDaLinha(linha: LinhaIntegracao, providerForcado?: string): ConfigIntegracao {
  const settings = linha.config ?? null;
  const provider =
    providerForcado || String(settings?.provider || PROVIDER_POR_OMISSAO).toLowerCase();
  return {
    integracaoId: linha.id,
    provider,
    apiKey: linha.client_secret ?? null,
    settings,
  };
}

/**
 * Qual integração consulta um documento já emitido: a que o emitiu, quando se
 * sabe; senão a da empresa do contrato. Documentos anteriores a 17-09 vivem na
 * conta DEMO mesmo quando o contrato é de outra empresa.
 */
export function origemDaConsulta(fatura: { integracao_id: string | null } | null) {
  return fatura?.integracao_id
    ? ({ tipo: 'integracao_da_fatura', integracaoId: fatura.integracao_id } as const)
    : ({ tipo: 'empresa_do_contrato' } as const);
}

/** O `.maybeSingle()` do supabase-js devolve PGRST116 quando a consulta traz mais de uma linha. */
export function eVariasLinhas(erro: { code?: string } | null | undefined): boolean {
  return erro?.code === 'PGRST116';
}

export function mensagemVariasIntegracoes(nomeEmpresa: string | null, provider?: string): string {
  const quem = nomeEmpresa ?? 'Esta empresa';
  const label = PROVIDERS_CONHECIDOS.find((p) => p.slug === provider?.toLowerCase())?.label;
  return provider
    ? `${quem} tem mais de uma integração ${label ?? provider}; escolha qual usar.`
    : `${quem} tem mais de um software de faturação ativo; escolha o fornecedor.`;
}

/**
 * NC/RC achada só pelo número: duas empresas da org podem repetir a numeração, por isso
 * só vale se a integração for da empresa do documento.
 */
export function originalPorNumeroValido(
  integracaoId: string | null | undefined,
  integracoesDaEmpresa: { id: string }[]
): boolean {
  return !!integracaoId && integracoesDaEmpresa.some((l) => l.id === integracaoId);
}
