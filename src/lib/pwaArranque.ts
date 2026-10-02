// Arranque do PWA (service worker), fora do main.tsx para se poder testar com
// um registerSW falso. O service worker só existe na web da app:
//  • na app nativa causa tela branca e reloads em loop;
//  • em docs.wegest.pt descarregava o precache da app inteira, oferecia instalar
//    "WeGest Motorista" e, depois de um deploy, servia um index.html antigo
//    cujos chunks do docs já não existem.
import { ehDominioDocs } from '@/docs/lib/base';

/** Evento que avisa a UI (UpdateNotification) de que há versão nova à espera. */
export const EVENTO_VERSAO_NOVA = 'sw-update-available';

type Actualizar = (recarregar?: boolean) => Promise<void>;

declare global {
  interface Window {
    /** Activa o service worker novo; definido quando há versão à espera. */
    __swUpdate?: () => Promise<void>;
  }
}

type RegisterSW = (opcoes: {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (url: string, registo: ServiceWorkerRegistration | undefined) => void;
}) => Actualizar;

/** A app regista service worker (e mostra o aviso de versão nova) só na web, fora da docs. */
export function usaServiceWorker(nativo: boolean, hostname: string): boolean {
  return !nativo && !ehDominioDocs(hostname);
}

/**
 * Em docs.wegest.pt: tira o service worker e as caches a quem já os apanhou e
 * remove o <link rel="manifest">, para o browser não oferecer instalar a app.
 */
export async function desligarPwa(janela: Window = window): Promise<void> {
  janela.document.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove());
  const sw = janela.navigator.serviceWorker;
  if (sw) {
    const registos = await sw.getRegistrations();
    await Promise.all(registos.map((r) => r.unregister()));
  }
  if ('caches' in janela) {
    const nomes = await janela.caches.keys();
    await Promise.all(nomes.map((n) => janela.caches.delete(n)));
  }
}

/** Decide e faz: regista o service worker na web, desliga-o na docs, nada no nativo. */
export function arrancarPwa({
  nativo,
  hostname,
  registerSW,
  janela = window,
}: {
  nativo: boolean;
  hostname: string;
  registerSW: RegisterSW;
  janela?: Window;
}): 'web' | 'docs' | 'nativo' {
  if (nativo) return 'nativo';
  if (ehDominioDocs(hostname)) {
    void desligarPwa(janela);
    return 'docs';
  }

  const actualizar = registerSW({
    onNeedRefresh() {
      janela.__swUpdate = () => actualizar(true);
      janela.dispatchEvent(new CustomEvent(EVENTO_VERSAO_NOVA));
    },
    onOfflineReady() {},
    onRegisteredSW(_url, registo) {
      if (!registo) return;
      // Verificar actualizações a cada 5 minutos e ao voltar ao separador.
      janela.setInterval(() => void registo.update(), 5 * 60 * 1000);
      janela.document.addEventListener('visibilitychange', () => {
        if (janela.document.visibilityState === 'visible') void registo.update();
      });
    },
  });
  return 'web';
}
