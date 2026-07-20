import { Capacitor } from '@capacitor/core';

const NATIVE_AUTH_WEB_BASE_URL = 'https://wegest.pt';
const NATIVE_DRIVER_ENTRY_ROUTE = '/motorista';
const NATIVE_DRIVER_LOGIN_ROUTE = '/motorista/login';
const NATIVE_DRIVER_PANEL_ROUTE = '/motorista/painel';

export const isNativeApp = () => Capacitor.isNativePlatform();

export const isNativeDriverOnlyMode = () => isNativeApp();

export const isIOSNativeApp = () => isNativeApp() && Capacitor.getPlatform() === 'ios';

export const isAndroidNativeApp = () => isNativeApp() && Capacitor.getPlatform() === 'android';

export const getBaseUrl = () => window.location.origin;

export const getAuthRedirectBaseUrl = () =>
  isNativeApp() ? NATIVE_AUTH_WEB_BASE_URL : getBaseUrl();

export const getNativeEntryRoute = () => NATIVE_DRIVER_ENTRY_ROUTE;

export const getNativeLoginRoute = () => NATIVE_DRIVER_LOGIN_ROUTE;

export const getNativePanelRoute = () => NATIVE_DRIVER_PANEL_ROUTE;

// Rota de login para um utilizador SEM sessão.
//  • App nativa (só motorista)      → entrada do motorista.
//  • Web, a partir do portal motorista (/motorista/*) → login do motorista (/login).
//  • Web, a partir da área de staff  → login da equipa (/equipa).
// `pathname` opcional: quando não é dado, mantém o login do motorista (/login),
// o comportamento histórico usado no ecrã partilhado de reset de password.
// Sem isto, um utilizador de staff que perdesse a sessão (ex.: SIGNED_OUT
// propagado a outras tabs ao fazer logout numa) era atirado para a área do
// motorista em vez do login da equipa.
export const getUnauthenticatedRoute = (pathname?: string) => {
  if (isNativeDriverOnlyMode()) return getNativeEntryRoute();
  if (!pathname) return '/login';
  const isMotoristaPortal = /^\/motorista(\/|$)/.test(pathname);
  return isMotoristaPortal ? '/login' : '/equipa';
};

export const getPostAuthRoute = () => (isNativeDriverOnlyMode() ? getNativePanelRoute() : '/crm');

export const getResetPasswordRedirectUrl = () => `${getAuthRedirectBaseUrl()}/reset-password`;

export const getEmailRedirectUrl = (path = '/') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getAuthRedirectBaseUrl()}${normalizedPath}`;
};
