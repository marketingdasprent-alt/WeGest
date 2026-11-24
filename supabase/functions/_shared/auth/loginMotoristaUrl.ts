// Década Ousada serve a app em wegest.pt; as restantes orgs no seu subdomínio.
const CODIGOS_NO_DOMINIO_RAIZ = new Set(['decada']);

// APP_URL só vale se for https: o link vai num email com credenciais.
function baseHttps(appUrl?: string): string | null {
  if (!appUrl) return null;
  try {
    const u = new URL(appUrl.trim());
    return u.protocol === 'https:' ? appUrl.trim().replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

export function urlLoginMotorista(codigo: string | null | undefined, appUrl?: string): string {
  const limpo = (codigo ?? '').trim().toLowerCase();
  const base = baseHttps(appUrl) ??
    (limpo && !CODIGOS_NO_DOMINIO_RAIZ.has(limpo) && /^[a-z0-9-]+$/.test(limpo)
      ? `https://${limpo}.wegest.pt`
      : 'https://wegest.pt');
  return `${base}/motorista/login`;
}
