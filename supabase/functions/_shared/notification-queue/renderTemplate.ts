/**
 * Interpolação dos templates de email do notification_queue.
 *
 * PORQUE `{{var}}` ESCAPA E `{{{var}}}` NÃO
 * O resultado desta função é entregue ao provider como `html` — sempre, mesmo
 * quando `notification_templates.corpo_formato` diz 'text' (o worker ignora
 * essa coluna). Os valores vêm de `payload_render`, que carrega campos de
 * domínio livremente escritos por pessoas: `cliente_nome`, `descricao`,
 * `motivo`, `titulo` de ticket, `nome` de uma candidatura submetida por
 * formulário público, `last_error`.
 *
 * Sem escape, um valor com `<a href="https://...">Clique aqui</a>` era
 * renderizado como HTML dentro de um email assinado pela empresa. Não é XSS na
 * aplicação (o React escapa) — é phishing com o remetente da própria
 * organização, que é pior porque passa em todas as verificações do
 * destinatário.
 *
 * A forma tripla existe para o único caso legítimo: `{{{lista}}}` no template
 * `digest.resumo_diario`, cujo valor é montado em SQL com `<br>` como
 * separador. Tudo o resto escapa por omissão — a decisão de confiar num valor
 * passa a ser explícita e visível no próprio template.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function textoDe(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  // A forma tripla é resolvida primeiro: se a dupla corresse antes, comia as
  // chavetas interiores e `{{{x}}}` acabava como `{` + valor escapado + `}`.
  return template
    .replace(/\{\{\{\s*(\w+)\s*\}\}\}/g, (_m, key: string) => textoDe(vars[key]))
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => escapeHtml(textoDe(vars[key])));
}
