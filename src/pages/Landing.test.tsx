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

// SectionHeading parte o título em <span> por palavra (stagger do Anime.js),
// por isso getByText(string) não casa — o texto já não vive num nó só.
// Comparamos directamente o textContent de cada <h2>, normalizado (NFC) para
// não falhar por acentos compostos de forma diferente (NFD vs NFC).
function headingTexts(): string[] {
  return Array.from(document.querySelectorAll('h2')).map((h2) =>
    (h2.textContent ?? '').normalize('NFC')
  );
}

function nfc(text: string): string {
  return text.normalize('NFC');
}

describe('Landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra a landing pública com todos os actos quando não há utilizador autenticado', () => {
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

    const titles = headingTexts();
    expect(titles).toContain(nfc('A frota nunca para. O sistema também não devia.'));
    expect(titles).toContain(nfc('Testado na nossa própria frota.'));
    expect(titles).toContain(nfc('Tudo conectado, automaticamente.'));
    expect(titles).toContain(nfc('Liga só o que precisas.'));
    expect(titles).toContain(nfc('Comece hoje mesmo.'));

    expect(screen.getByRole('link', { name: 'Começar agora' })).toHaveAttribute(
      'href',
      '/registar-org'
    );
    expect(screen.getByRole('link', { name: 'Criar a minha organização' })).toHaveAttribute(
      'href',
      '/registar-org'
    );
    expect(screen.getByRole('button', { name: 'Fale conosco' })).toBeTruthy();

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

    expect(headingTexts()).toHaveLength(0);
  });
});
