// Parte pura da página pública /api/docs (fica fora do .tsx para o fast refresh).

export function urlDaEspecificacao(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/api-rent-a-car/v1/openapi.json`;
}

/**
 * Nada desta página sai para a Scalar: sem telemetria, sem as fontes deles e sem
 * proxyUrl (o "experimentar" chama a API directamente; com proxy, a chave do
 * leitor passava por api.scalar.com). Fixado explicitamente, sem depender dos
 * valores por omissão da versão: a chave não persiste no browser, sem agente
 * de IA, sem MCP e sem ferramentas de programador.
 */
export const CONFIGURACAO_BASE = {
  telemetry: false,
  withDefaultFonts: false,
  persistAuth: false,
  agent: { disabled: true },
  mcp: { disabled: true },
  showDeveloperTools: 'never',
  hideModels: false,
  theme: 'default',
} as const;
