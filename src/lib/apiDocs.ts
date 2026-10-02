// Configuração do leitor Scalar da Referência interactiva (docs.wegest.pt/referencia).
// Fica fora do .tsx para o fast refresh e para o teste a ler sem montar o Scalar.

/**
 * Nada desta página sai para a Scalar: sem telemetria, sem as fontes deles e com
 * proxyUrl vazio (o "experimentar" chama a API directamente; com proxy, a chave do
 * leitor passava por api.scalar.com). Fixado explicitamente, sem depender dos
 * valores por omissão da versão: a chave não persiste no browser, sem agente
 * de IA, sem MCP e sem ferramentas de programador.
 */
export const CONFIGURACAO_BASE = {
  telemetry: false,
  withDefaultFonts: false,
  // String vazia, não undefined: com undefined o layout 'web' cai em
  // proxy.scalar.com; com '' o Scalar nunca usa proxy.
  proxyUrl: '',
  persistAuth: false,
  agent: { disabled: true },
  mcp: { disabled: true },
  showDeveloperTools: 'never',
  hideModels: false,
  // O tema segue o next-themes da página (forceDarkModeState), sem botão próprio.
  hideDarkModeToggle: true,
  theme: 'default',
} as const;

/** Tokens do WeGest nas variáveis do Scalar; o acento é o primary-text (4,5:1). */
export const CSS_SCALAR = `
.light-mode, .dark-mode {
  --scalar-background-1: hsl(var(--background));
  --scalar-background-2: hsl(var(--card));
  --scalar-background-3: hsl(var(--muted));
  --scalar-color-1: hsl(var(--foreground));
  --scalar-color-2: hsl(var(--muted-foreground));
  --scalar-color-3: hsl(var(--muted-foreground));
  --scalar-color-accent: hsl(var(--primary-text));
  --scalar-background-accent: hsl(var(--primary-text) / 0.1);
  --scalar-border-color: hsl(var(--border));
  --scalar-font: Manrope, sans-serif;
}
`;
