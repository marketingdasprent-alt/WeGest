// Cloudflare Turnstile: carrega o script uma vez e devolve a API do widget.
// A validação real é feita no servidor (_shared/captcha/turnstile.ts).

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// Pública por natureza (vai no HTML). O widget só aceita wegest.pt e subdomínios.
const SITE_KEY_PRODUCAO = '0x4AAAAAAFDhLCEZG5n1fZ1i';

/** Tem de coincidir com a acção que cada Edge Function exige. */
export type AcaoCaptcha = 'registo_org' | 'contacto' | 'ticket_ti';

export interface TurnstileOptions {
  sitekey: string;
  action: AcaoCaptcha;
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

function dominioDoWidget(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'wegest.pt' || host.endsWith('.wegest.pt');
}

/**
 * Chave pública; vazia = widget desligado. A variável de ambiente manda (vazia
 * desliga); sem ela, só a build de produção servida em wegest.pt usa a chave
 * real — noutro domínio o widget falhava e o envio ficava bloqueado.
 */
export function turnstileSiteKey(hostname: string = window.location.hostname): string {
  const env = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  if (env !== undefined) return env;
  return import.meta.env.PROD && dominioDoWidget(hostname) ? SITE_KEY_PRODUCAO : '';
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
