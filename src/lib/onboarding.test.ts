import { describe, it, expect, beforeEach } from 'vitest';

import {
  ONBOARDING_VERSION,
  onboardingStorageKey,
  hasSeenOnboarding,
  markOnboardingSeen,
  shouldShowOnboarding,
} from './onboarding';

beforeEach(() => {
  localStorage.clear();
});

describe('onboardingStorageKey', () => {
  it('inclui a versão e o userId', () => {
    expect(onboardingStorageKey('user-123')).toBe(
      `wegest_onboarding_v${ONBOARDING_VERSION}_user-123`
    );
  });
});

describe('hasSeenOnboarding / markOnboardingSeen', () => {
  it('devolve false quando nunca foi visto', () => {
    expect(hasSeenOnboarding('user-123')).toBe(false);
  });

  it('devolve true depois de marcar como visto', () => {
    markOnboardingSeen('user-123');
    expect(hasSeenOnboarding('user-123')).toBe(true);
  });

  it('isola o estado por userId', () => {
    markOnboardingSeen('user-123');
    expect(hasSeenOnboarding('outro-user')).toBe(false);
  });
});

describe('shouldShowOnboarding', () => {
  const base = {
    userId: 'user-123',
    tipoUtilizador: 'colaborador' as const,
    initialized: true,
    loading: false,
  };

  it('mostra para colaborador autenticado que ainda não viu', () => {
    expect(shouldShowOnboarding(base)).toBe(true);
  });

  it('não mostra sem userId', () => {
    expect(shouldShowOnboarding({ ...base, userId: null })).toBe(false);
  });

  it('não mostra enquanto as permissões não inicializaram', () => {
    expect(shouldShowOnboarding({ ...base, initialized: false })).toBe(false);
  });

  it('não mostra durante o loading', () => {
    expect(shouldShowOnboarding({ ...base, loading: true })).toBe(false);
  });

  it('não mostra a motoristas', () => {
    expect(shouldShowOnboarding({ ...base, tipoUtilizador: 'motorista' })).toBe(false);
  });

  it('não mostra se já foi visto', () => {
    markOnboardingSeen('user-123');
    expect(shouldShowOnboarding(base)).toBe(false);
  });
});
