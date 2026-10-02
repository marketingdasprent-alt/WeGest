import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENTO_VERSAO_NOVA, arrancarPwa, desligarPwa, usaServiceWorker } from './pwaArranque';

/** Janela falsa com o que o arranque usa: SW, caches, document e eventos. */
function janelaFalsa() {
  const unregister = vi.fn(async () => true);
  const apagar = vi.fn(async () => true);
  const eventos: string[] = [];
  const documento = document.implementation.createHTMLDocument('x');
  const link = documento.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.webmanifest';
  documento.head.appendChild(link);
  const janela = {
    document: documento,
    navigator: {
      serviceWorker: { getRegistrations: vi.fn(async () => [{ unregister }, { unregister }]) },
    },
    caches: { keys: vi.fn(async () => ['workbox-precache-v2', 'images-cache']), delete: apagar },
    dispatchEvent: (e: Event) => {
      eventos.push(e.type);
      return true;
    },
    setInterval: vi.fn(),
  } as unknown as Window;
  return { janela, unregister, apagar, eventos, documento };
}

describe('usaServiceWorker', () => {
  it('só na web da app: nunca no nativo nem em docs.wegest.pt', () => {
    expect(usaServiceWorker(false, 'wegest.pt')).toBe(true);
    expect(usaServiceWorker(true, 'localhost')).toBe(false);
    expect(usaServiceWorker(false, 'docs.wegest.pt')).toBe(false);
  });
});

describe('arrancarPwa', () => {
  afterEach(() => vi.restoreAllMocks());

  it('no nativo não chama registerSW nem mexe em nada', () => {
    const { janela, unregister } = janelaFalsa();
    const registerSW = vi.fn();
    expect(arrancarPwa({ nativo: true, hostname: 'localhost', registerSW, janela })).toBe('nativo');
    expect(registerSW).not.toHaveBeenCalled();
    expect(unregister).not.toHaveBeenCalled();
  });

  it('em docs.wegest.pt não regista e desliga o que lá houver', async () => {
    const { janela, unregister, apagar, documento } = janelaFalsa();
    const registerSW = vi.fn();
    expect(arrancarPwa({ nativo: false, hostname: 'docs.wegest.pt', registerSW, janela })).toBe(
      'docs'
    );
    expect(registerSW).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(apagar).toHaveBeenCalledTimes(2));
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(documento.querySelector('link[rel="manifest"]')).toBeNull();
  });

  it('na web regista uma vez e, com versão nova, emite o evento e guarda __swUpdate', async () => {
    const { janela, eventos } = janelaFalsa();
    const actualizar = vi.fn(async () => undefined);
    let opcoes: Parameters<Parameters<typeof arrancarPwa>[0]['registerSW']>[0] = {};
    const registerSW = vi.fn((o: typeof opcoes) => {
      opcoes = o;
      return actualizar;
    });
    expect(arrancarPwa({ nativo: false, hostname: 'wegest.pt', registerSW, janela })).toBe('web');
    expect(registerSW).toHaveBeenCalledTimes(1);
    opcoes.onNeedRefresh?.();
    expect(eventos).toEqual([EVENTO_VERSAO_NOVA]);
    await janela.__swUpdate?.();
    expect(actualizar).toHaveBeenCalledWith(true);
  });
});

describe('desligarPwa', () => {
  it('sem service worker nem caches no browser não rebenta', async () => {
    const documento = document.implementation.createHTMLDocument('x');
    const janela = { document: documento, navigator: {} } as unknown as Window;
    await expect(desligarPwa(janela)).resolves.toBeUndefined();
  });
});
