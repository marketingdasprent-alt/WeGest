/**
 * Interpolação dos templates de email do notification_queue.
 *
 * `{{var}}` escapa por omissão porque os valores vêm de campos de domínio
 * escritos livremente por pessoas; sem escape um valor com `<a href>` virava
 * phishing assinado pela própria organização. `{{{var}}}` (sem escape) só
 * serve o caso legítimo de `digest.resumo_diario`, montado em SQL com `<br>`.
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
