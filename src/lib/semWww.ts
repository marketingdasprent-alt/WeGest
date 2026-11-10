/**
 * `www.wegest.pt/...` → `wegest.pt/...`, com o mesmo caminho e parâmetros.
 * Links já gravados com www (convites de registo) davam 404 em telemóveis com
 * uma versão antiga do site guardada para o www, que o browser trata como outro
 * site. `null` = já está sem www.
 */
export function urlSemWww(href: string): string | null {
  const url = new URL(href);
  if (!url.hostname.startsWith('www.')) return null;
  url.hostname = url.hostname.slice(4);
  return url.toString();
}
