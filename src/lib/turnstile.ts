// Cloudflare Turnstile: carrega o script uma vez e devolve a API do widget.
// A validação real é feita no servidor (_shared/captcha/turnstile.ts).

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface TurnstileOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  language?: string;
}

export interface TurnstileApi {
  render: (el: HTMLElement, options: TurnstileOptions) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Chave pública; vazia = CAPTCHA desligado (o servidor também não o exige). */
export function turnstileSiteKey(): string {
  return (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? '';
}

let carregamento: Promise<TurnstileApi> | null = null;

export function carregarTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  carregamento ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile indisponível'));
    script.onerror = () => {
      carregamento = null;
      reject(new Error('Não foi possível carregar a verificação anti-robô'));
    };
    document.head.appendChild(script);
  });
  return carregamento;
}
