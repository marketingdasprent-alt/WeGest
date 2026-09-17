/**
 * Rotas servidas sem sessão — a landing, as páginas institucionais e os acessos
 * por token (galeria de danos, quadro de TV, formulários públicos).
 *
 * Existe porque o `NotificacoesPopup`, montado fora das rotas, só filtrava por
 * "não é motorista" e mostrava avisos internos sobre o quadro de TV e a landing
 * pública. Fica centralizada aqui para o teste a comparar com WebAppRoutes.
 */

/** Caminhos públicos com correspondência exacta. */
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

/**
 * Prefixos públicos: o acesso é por token no próprio URL, não por sessão.
 * Estes são os mais sensíveis da lista — o quadro de TV fica projetado numa
 * parede, e a galeria de danos é enviada por QR a clientes.
 */
const PREFIXOS = ['/formulario/', '/danos/', '/quadro/'];

/**
 * `true` quando o caminho é servido sem sessão autenticada.
 *
 * Normaliza a barra final para que `/termos` e `/termos/` sejam o mesmo — sem
 * isto, uma barra a mais reintroduzia o problema em silêncio.
 */
export function isRotaPublica(pathname: string): boolean {
  const normalizado =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (EXATAS.has(normalizado)) return true;
  return PREFIXOS.some((prefixo) => normalizado.startsWith(prefixo));
}
