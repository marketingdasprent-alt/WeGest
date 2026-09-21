import { describe, it, expect, afterEach, vi } from 'vitest';
import { estaInstaladoComoApp, deveBloquearNoPwa } from './pwa';

/** Repõe o que cada teste mexeu — `window` é partilhado entre eles. */
const original = {
  matchMedia: window.matchMedia,
  standalone: (window.navigator as Navigator & { standalone?: boolean }).standalone,
};

afterEach(() => {
  window.matchMedia = original.matchMedia;
  Object.defineProperty(window.navigator, 'standalone', {
    value: original.standalone,
    configurable: true,
  });
});

const comMatchMedia = (standalone: boolean) => {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: standalone }) as unknown as typeof matchMedia;
};

describe('estaInstaladoComoApp', () => {
  it('false num separador normal do browser', () => {
    comMatchMedia(false);
    expect(estaInstaladoComoApp()).toBe(false);
  });

  it('true quando o display-mode é standalone (Android, desktop)', () => {
    comMatchMedia(true);
    expect(estaInstaladoComoApp()).toBe(true);
  });

  it('true no Safari do iOS, que só expõe navigator.standalone', () => {
    // O iOS não responde ao display-mode: sem este ramo, a app instalada num
    // iPhone era tratada como um separador qualquer.
    comMatchMedia(false);
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    expect(estaInstaladoComoApp()).toBe(true);
  });

  it('não rebenta quando matchMedia não existe', () => {
    // Browsers antigos e ambientes de teste — vale mais devolver false do que
    // deitar abaixo o ProtectedRoute, que corre em todas as rotas.
    (window as { matchMedia?: typeof matchMedia }).matchMedia = undefined;
    Object.defineProperty(window.navigator, 'standalone', {
      value: undefined,
      configurable: true,
    });
    expect(estaInstaladoComoApp()).toBe(false);
  });
});

describe('deveBloquearNoPwa', () => {
  const base = {
    instalado: true,
    loading: false,
    temSessao: true,
    perfilResolvido: true,
  } as const;

  it('deixa passar o motorista — é para ele que a app existe', () => {
    expect(deveBloquearNoPwa({ ...base, tipoUtilizador: 'motorista' })).toBe(false);
  });

  it('bloqueia o colaborador de backoffice', () => {
    expect(deveBloquearNoPwa({ ...base, tipoUtilizador: 'colaborador' })).toBe(true);
  });

  it('não bloqueia nada no browser, mesmo a um colaborador', () => {
    // O backoffice no navegador continua igual ao que sempre foi.
    expect(deveBloquearNoPwa({ ...base, instalado: false, tipoUtilizador: 'colaborador' })).toBe(
      false
    );
  });

  it('não decide enquanto as permissões carregam', () => {
    // `tipoUtilizador` arranca em 'colaborador' por omissão: decidir a meio do
    // carregamento piscava o aviso na cara do motorista a cada arranque.
    expect(deveBloquearNoPwa({ ...base, loading: true, tipoUtilizador: 'colaborador' })).toBe(
      false
    );
  });

  it('não decide sem sessão — quem trata disso é o redireccionamento para o login', () => {
    expect(deveBloquearNoPwa({ ...base, temSessao: false, tipoUtilizador: 'colaborador' })).toBe(
      false
    );
  });

  it('não decide com o perfil por resolver, mesmo com loading a false', () => {
    // O caso que interessa: erro a ler o membership (ou org por escolher) põe
    // o PermissionsContext em DEFAULT_STATE — 'colaborador' e loading false.
    // Bloquear aqui prendia o motorista num ecrã sem barra de endereço por
    // causa de uma falha de rede.
    expect(
      deveBloquearNoPwa({ ...base, perfilResolvido: false, tipoUtilizador: 'colaborador' })
    ).toBe(false);
  });
});
