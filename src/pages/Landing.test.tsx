import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
import { HERO, RECONHECIMENTO, CTA_FINAL } from '@/components/site/content/landingContent';
import { metricasPublicaveis } from '@/components/site/content/provaData';

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
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );
}

function comoVisitanteAnonimo() {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    session: null,
    loading: false,
    signOut: vi.fn(),
  });
  vi.mocked(useDefaultRoute).mockReturnValue({ defaultRoute: null, loading: false });
}

describe('Landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('o hero fala do cliente, e diz categoria, problema e próximo passo', () => {
    comoVisitanteAnonimo();
    renderLanding();

    // O H1 é sobre a frota do visitante — não sobre a nossa. A versão anterior
    // abria com "a nossa própria frota", que responde a uma pergunta que o
    // visitante ainda não fez.
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe(HERO.titulo);
    expect(h1.textContent).not.toMatch(/nossa própria frota/i);

    // Categoria e destinatário visíveis sem interação.
    expect(screen.getByText(HERO.categoria)).toBeTruthy();
    expect(screen.getByText(HERO.subtitulo)).toBeTruthy();

    // CTA com custo de tempo explícito, e uma saída para quem quer ver antes.
    expect(screen.getByRole('button', { name: HERO.ctaPrimario })).toBeTruthy();
    expect(screen.getByRole('link', { name: new RegExp(HERO.ctaSecundario, 'i') })).toBeTruthy();
  });

  it('conta a narrativa antes de mostrar o produto', () => {
    comoVisitanteAnonimo();
    renderLanding();

    const secoes = Array.from(document.querySelectorAll('main section[id]')).map((el) => el.id);

    // A ordem é o produto desta página: dor e custo antes do sistema.
    expect(secoes).toEqual([
      'reconhecimento',
      'custo',
      'mudanca',
      'como-funciona',
      'sistema',
      'automacoes',
      'prova',
      'objecoes',
      'contacto',
    ]);
    expect(secoes.indexOf('reconhecimento')).toBeLessThan(secoes.indexOf('sistema'));
  });

  it('nomeia a dor em discurso direto', () => {
    comoVisitanteAnonimo();
    renderLanding();

    expect(screen.getByText(RECONHECIMENTO.titulo)).toBeTruthy();
    RECONHECIMENTO.frases.forEach((frase) => {
      expect(screen.getByText(frase.citacao)).toBeTruthy();
    });
  });

  it('a demo do sistema é um tablist acessível, não scroll capturado', () => {
    comoVisitanteAnonimo();
    renderLanding();

    const tablist = screen.getByRole('tablist', { name: 'Módulos do sistema' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.length).toBeGreaterThanOrEqual(7);

    // Exatamente uma tab selecionada, e só ela é alcançável por Tab.
    const selecionadas = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true');
    expect(selecionadas).toHaveLength(1);
    expect(selecionadas[0].getAttribute('tabindex')).toBe('0');

    // Rótulos por resultado, não por objeto da base de dados.
    expect(within(tablist).getByRole('tab', { name: 'Gerir contratos' })).toBeTruthy();
    expect(within(tablist).getByRole('tab', { name: 'Ver a operação' })).toBeTruthy();

    // O painel está ligado à tab ativa.
    const painel = screen.getByRole('tabpanel');
    expect(painel.getAttribute('aria-labelledby')).toBe(selecionadas[0].id);
  });

  it('só publica métricas de prova que têm valor real', () => {
    comoVisitanteAnonimo();
    renderLanding();

    const publicaveis = metricasPublicaveis();
    expect(publicaveis.length).toBeGreaterThan(0);

    publicaveis.forEach((metrica) => {
      expect(screen.getByText(metrica.rotulo)).toBeTruthy();
    });

    // Um slot sem número não pode aparecer na página.
    expect(screen.queryByText('contratos geridos no sistema')).toBeNull();
  });

  it('o formulário pede o mínimo: a mensagem é opcional', () => {
    comoVisitanteAnonimo();
    renderLanding();

    const nome = screen.getByLabelText('Nome') as HTMLInputElement;
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    expect(nome.required).toBe(true);
    expect(email.required).toBe(true);

    // A exigência de 10 caracteres de prosa era um muro à frente do único
    // evento de conversão do site.
    const mensagem = screen.getByLabelText(/o que gostaria de ver/i) as HTMLTextAreaElement;
    expect(mensagem.required).toBe(false);
    expect(mensagem.minLength).toBeLessThanOrEqual(0);

    // Campo de qualificação: um clique, não texto livre.
    expect(screen.getByLabelText('Quantas viaturas')).toBeTruthy();

    // O botão diz o que acontece, não "Enviar".
    expect(screen.getByRole('button', { name: CTA_FINAL.botao })).toBeTruthy();
  });

  it('a página tem fundo: rodapé com institucional e entrada de clientes', () => {
    comoVisitanteAnonimo();
    renderLanding();

    const rodape = screen.getByRole('contentinfo');
    expect(within(rodape).getByRole('link', { name: 'Termos' })).toBeTruthy();
    expect(within(rodape).getByRole('link', { name: 'Privacidade' })).toBeTruthy();
    expect(within(rodape).getByRole('link', { name: 'Cookies' })).toHaveAttribute(
      'href',
      '/cookies'
    );
    expect(within(rodape).getByRole('link', { name: 'Sobre' })).toBeTruthy();
    expect(within(rodape).getByRole('link', { name: 'Perguntas frequentes' })).toBeTruthy();
    expect(within(rodape).getByRole('link', { name: 'Entrar no sistema' })).toHaveAttribute(
      'href',
      '/entrar'
    );

    // O rodapé aparece também nas páginas institucionais, onde uma âncora
    // `#contacto` não teria destino — logo tem de ser tudo caminho absoluto.
    within(rodape)
      .getAllByRole('link')
      .forEach((link) => {
        expect(link.getAttribute('href')).not.toMatch(/^#/);
      });
  });

  it('não mostra a landing quando há utilizador autenticado', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as never,
      session: null,
      loading: false,
      signOut: vi.fn(),
    });
    vi.mocked(useDefaultRoute).mockReturnValue({ defaultRoute: '/dashboard', loading: false });

    renderLanding();

    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(document.querySelectorAll('main section[id]')).toHaveLength(0);
  });
});
