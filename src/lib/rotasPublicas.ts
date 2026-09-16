/** Centraliza rotas sem sessão para impedir UI interna em superfícies públicas. */

const EXATAS = new Set([
  '/',
  '/entrar',
  '/login',
  '/equipa',
  '/register',
  '/registar-org',
  '/reset-password',
  '/obrigado',
  '/sobre',
  '/contactos',
  '/faq',
  '/termos',
  '/privacidade',
  '/cookies',
  '/eliminar-conta',
]);

/** Estes prefixos são autorizados pelo token no URL, não pela sessão. */
const PREFIXOS = ['/formulario/', '/danos/', '/quadro/'];

/** Normaliza a barra final para evitar contornar a lista de rotas públicas. */
export function isRotaPublica(pathname: string): boolean {
  const normalizado =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (EXATAS.has(normalizado)) return true;
  return PREFIXOS.some((prefixo) => normalizado.startsWith(prefixo));
}
