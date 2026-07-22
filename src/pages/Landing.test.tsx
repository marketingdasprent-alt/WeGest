import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useDefaultRoute', () => ({
  useDefaultRoute: vi.fn(),
}));

import Landing from './Landing';
import { useAuth } from '@/contexts/AuthContext';
import { useDefaultRoute } from '@/hooks/useDefaultRoute';

beforeAll(() => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});

// SectionHeading parte alguns títulos em <span> por palavra (stagger do
// Anime.js), por isso getByText(string) não casa sempre — comparamos o
// textContent de cada heading, normalizado (NFC) para não falhar por acentos
// compostos de forma diferente (NFD vs NFC).
function headingTexts(selector: string): string[] {
  return Array.from(document.querySelectorAll(selector)).map((el) =>
    (el.textContent ?? '').normalize('NFC')
  );
}

function nfc(text: string): string {
  return text.normalize('NFC');
}

describe('Landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra a landing pública com o tour quando não há utilizador autenticado', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: null,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(useDefaultRoute).mockReturnValue({ defaultRoute: null, loading: false });

    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    // Hero
    expect(headingTexts('h1')).toContain(nfc('O software que já gere a nossa própria frota.'));

    // Tour: sidebar com todos os módulos + FAQ/Contacto + grupo institucional,
    // painel ativo inicial = Dashboard. Não há mais CTA/footer soltos — o
    // tour é a página inteira, criar org / entrar vivem no rodapé da sidebar.
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Renting' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Frota' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Motoristas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Movimentações' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Assistência' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'CRM' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Marketing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'E muito mais' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'FAQ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Contacto' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sobre' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Termos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Privacidade' })).toBeTruthy();
    expect(headingTexts('h2')).toContain(nfc('Dashboard'));

    // Sem self-serve: CTA é sempre "Fale connosco" (hero + rodapé da
    // sidebar), nunca "Criar organização" — só criamos depois de assinar.
    const contactButtons = screen.getAllByRole('button', { name: 'Fale connosco' });
    expect(contactButtons.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Criar a minha organização')).toBeNull();

    const entrarLinks = screen.getAllByRole('link', { name: 'Já é cliente? Entrar' });
    expect(entrarLinks.length).toBeGreaterThan(0);
    expect(entrarLinks[0]).toHaveAttribute('href', '/entrar');
  });

  it('não mostra a landing quando há utilizador autenticado', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as never,
      session: null,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(useDefaultRoute).mockReturnValue({ defaultRoute: '/dashboard', loading: false });

    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    expect(headingTexts('h1')).toHaveLength(0);
    expect(headingTexts('h2')).toHaveLength(0);
  });
});
