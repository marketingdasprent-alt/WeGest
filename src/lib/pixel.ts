// O Pixel só é carregado por páginas públicas para não enviar metadados do
// backoffice autenticado ao Facebook.

export type PixelEventParams = Record<string, any>;

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: unknown;
  }
}

const PIXEL_ID = '1212569624343076';
let initialized = false;

export function initPixel(): void {
  if (initialized || typeof window === 'undefined') return;
  if (typeof window.fbq === 'function') {
    initialized = true;
    return;
  }

  (function (f: Window, b: Document, e: string, v: string) {
    const n: any = function () {
      // eslint-disable-next-line prefer-rest-params
      return n.callMethod ? n.callMethod(...arguments) : n.queue.push(arguments);
    };
    f.fbq = n;
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode?.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  const fbq = window.fbq as ((...args: any[]) => void) | undefined;
  fbq?.('init', PIXEL_ID);
  fbq?.('track', 'PageView');
  initialized = true;
}

export function trackEventOnce(eventName: string, params: PixelEventParams = {}, key?: string) {
  try {
    const routeKey = typeof window !== 'undefined' ? window.location.pathname : 'unknown';
    const lockKey = key || `${eventName}@${routeKey}`;
    const storageKey = `fb_event_${lockKey}`;

    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(storageKey)) {
      return;
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(storageKey, '1');
    }

    initPixel();

    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      const eventID = `${eventName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      window.fbq('track', eventName, params, { eventID });
      if (import.meta.env.DEV) {
        console.info(`[Pixel] Tracked ${eventName}`, { params, eventID, lockKey });
      }
    } else if (import.meta.env.DEV) {
      console.warn('[Pixel] fbq not available yet');
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[Pixel] trackEventOnce error', e);
    }
  }
}

export function trackLeadOnce(params: PixelEventParams = {}) {
  trackEventOnce('Lead', {
    value: 1,
    content_name: 'Formulário enviado',
    ...params,
  });
}
