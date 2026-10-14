// Recusa emitir de novo uma cobrança cuja emissão anterior ficou com resultado incerto.
// TS puro, sem APIs de Deno: usado pela edge function faturacao-emitir e testado pelo
// Vitest (src/lib/faturacaoReemissao.test.ts).

import { PROVIDERS_CONHECIDOS } from './escolha.ts';

/** Linha de `failed_jobs` por resolver, como `linhaDeFalhaEmissao` (falhas.ts) a escreve. */
export interface FalhaPorResolver {
  payload: unknown;
}

/** Só FT/FR de uma cobrança: é aí que um segundo documento duplica o primeiro. */
export function verificarEmissaoIncerta(tipo?: string, cobrancaId?: string): boolean {
  return (tipo === 'FT' || tipo === 'FR') && !!cobrancaId;
}

/** Mensagem de recusa se alguma falha por resolver é 'unknown'; null quando pode emitir. */
export function recusaPorEmissaoIncerta(falhas: FalhaPorResolver[]): string | null {
  const incerta = falhas.find((f) => campo(f.payload, 'classe') === 'unknown');
  if (!incerta) return null;
  const slug = campo(incerta.payload, 'provider')?.trim();
  const nome = slug
    ? (PROVIDERS_CONHECIDOS.find((p) => p.slug === slug.toLowerCase())?.label ?? slug)
    : 'software de faturação';
  return (
    'Há uma emissão anterior desta cobrança com resultado incerto. ' +
    `Confirme no ${nome} se o documento foi criado e marque o alerta como resolvido em ` +
    'Automação antes de emitir de novo.'
  );
}

function campo(payload: unknown, chave: string): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const v = (payload as Record<string, unknown>)[chave];
  return typeof v === 'string' ? v : undefined;
}
