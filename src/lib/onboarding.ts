export const ONBOARDING_VERSION = 1;

export function onboardingStorageKey(userId: string): string {
  return `wegest_onboarding_v${ONBOARDING_VERSION}_${userId}`;
}

export function hasSeenOnboarding(userId: string): boolean {
  try {
    return localStorage.getItem(onboardingStorageKey(userId)) === 'true';
  } catch {
    // localStorage indisponível (ex.: modo privado) — trata como "não viu"
    return false;
  }
}

export function markOnboardingSeen(userId: string): void {
  try {
    localStorage.setItem(onboardingStorageKey(userId), 'true');
  } catch {
    // localStorage indisponível — ignora, não bloqueia o utilizador
  }
}

export interface OnboardingGateParams {
  userId: string | null | undefined;
  tipoUtilizador: 'motorista' | 'colaborador';
  initialized: boolean;
  loading: boolean;
}

export function shouldShowOnboarding(params: OnboardingGateParams): boolean {
  const { userId, tipoUtilizador, initialized, loading } = params;
  if (!userId) return false;
  if (!initialized || loading) return false;
  if (tipoUtilizador !== 'colaborador') return false;
  return !hasSeenOnboarding(userId);
}
