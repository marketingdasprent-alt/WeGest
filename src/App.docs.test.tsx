import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// Só interessa o que o App monta à volta das rotas: os providers passam os filhos.
const { ambiente, Passa } = vi.hoisted(() => ({
  ambiente: { docs: false, nativo: false },
  Passa: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/docs/lib/base', () => ({ ehDominioDocs: () => ambiente.docs }));
vi.mock('@/lib/native', () => ({
  isNativeApp: () => ambiente.nativo,
  isNativeDriverOnlyMode: () => ambiente.nativo,
}));
vi.mock('@/contexts/AuthContext', () => ({ AuthProvider: Passa }));
vi.mock('@/contexts/TenantContext', () => ({ TenantProvider: Passa }));
vi.mock('@/contexts/PermissionsContext', () => ({ PermissionsProvider: Passa }));
vi.mock('@/contexts/NotificacoesContext', () => ({ NotificacoesProvider: Passa }));
vi.mock('@/routes/WebAppRoutes', () => ({ default: () => <div data-testid="rotas-web" /> }));
vi.mock('@/routes/NativeAppRoutes', () => ({ default: () => <div data-testid="rotas-nativas" /> }));
vi.mock('@/components/UpdateNotification', () => ({
  UpdateNotification: () => <div data-testid="versao-nova" />,
}));
vi.mock('@/components/notificacoes/NotificacoesPopup', () => ({
  NotificacoesPopup: () => <div data-testid="popup" />,
}));
vi.mock('@/components/onboarding/OnboardingColaboradorDialog', () => ({
  OnboardingColaboradorDialog: () => <div data-testid="onboarding" />,
}));

import App from './App';

describe('o que o App monta por ambiente', () => {
  beforeEach(() => {
    ambiente.docs = false;
    ambiente.nativo = false;
  });

  it('em docs.wegest.pt só as rotas: sem popup, onboarding nem aviso de versão', () => {
    ambiente.docs = true;
    render(<App />);
    expect(screen.getByTestId('rotas-web')).toBeTruthy();
    expect(screen.queryByTestId('popup')).toBeNull();
    expect(screen.queryByTestId('onboarding')).toBeNull();
    expect(screen.queryByTestId('versao-nova')).toBeNull();
  });

  it('na app nativa o aviso de versão (service worker) não monta', () => {
    ambiente.nativo = true;
    render(<App />);
    expect(screen.getByTestId('rotas-nativas')).toBeTruthy();
    expect(screen.queryByTestId('versao-nova')).toBeNull();
  });

  it('na web da app continuam o popup, o onboarding e o aviso de versão', () => {
    render(<App />);
    expect(screen.getByTestId('rotas-web')).toBeTruthy();
    expect(screen.getByTestId('popup')).toBeTruthy();
    expect(screen.getByTestId('onboarding')).toBeTruthy();
    expect(screen.getByTestId('versao-nova')).toBeTruthy();
  });
});
