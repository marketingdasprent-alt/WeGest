const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function textoDe(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template
    .replace(/\{\{\{\s*(\w+)\s*\}\}\}/g, (_m, key: string) => textoDe(vars[key]))
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => escapeHtml(textoDe(vars[key])));
}
