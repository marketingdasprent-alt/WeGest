import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

import Sobre from './Sobre';
import FAQ from './FAQ';
import Contactos from './Contactos';
import Termos from './Termos';
import Privacidade from './Privacidade';
import Cookies from './Cookies';
import EliminarConta from './EliminarConta';
import { CONTACTO } from '@/components/site/content/institucionalContent';
import { OBJECOES } from '@/components/site/content/landingContent';

beforeAll(() => {
  // O Checkbox do Radix (EliminarConta) observa o tamanho do elemento.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

function renderPagina(pagina: ReactElement) {
  return render(<MemoryRouter>{pagina}</MemoryRouter>);
}

const PAGINAS: { nome: string; elemento: ReactElement; titulo: string }[] = [
  {
    nome: 'Sobre',
    elemento: <Sobre />,
    titulo: 'Construímos isto para nós antes de o vender a alguém.',
  },
  { nome: 'FAQ', elemento: <FAQ />, titulo: 'Tudo o que costumam perguntar antes de decidir.' },
  { nome: 'Contactos', elemento: <Contactos />, titulo: 'Fale com quem construiu o sistema.' },
  { nome: 'Termos', elemento: <Termos />, titulo: 'Termos de utilização' },
  { nome: 'Privacidade', elemento: <Privacidade />, titulo: 'Política de privacidade' },
  { nome: 'Cookies', elemento: <Cookies />, titulo: 'Política de cookies' },
  { nome: 'EliminarConta', elemento: <EliminarConta />, titulo: 'Eliminação de conta' },
];

describe('páginas institucionais', () => {
  it.each(PAGINAS)('$nome tem um só h1 e caminho de regresso ao site', ({ elemento, titulo }) => {
    renderPagina(elemento);

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe(titulo);

    // Quem chega a estas páginas vem de um link e precisa de voltar.
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it.each(PAGINAS)('$nome não usa cores fixas de tema', ({ elemento }) => {
    const { container } = renderPagina(elemento);

    // As versões anteriores tinham bg-black, gray-800 e #B20101/#E53333
    // escritos à mão, o que ignorava os tokens e partia o modo claro.
    const proibidas = /\b(bg-black|text-white|bg-gray-\d|text-gray-\d|border-gray-\d)\b/;
    const classes = Array.from(container.querySelectorAll('[class]'))
      .map((el) => el.getAttribute('class') ?? '')
      .join(' ');

    expect(classes).not.toMatch(proibidas);
  });

  it('Contactos mostra o mesmo email a que o link envia', () => {
    renderPagina(<Contactos />);

    // Regressão: a versão anterior mostrava motoristas.tvde@rotaliquida.pt e
    // enviava para motoristas.tvde@distanciaarrojada.pt — domínios diferentes.
    // Restrito ao `main`: o rodapé mostra o mesmo email, e o que se testa aqui
    // é o corpo da página de contactos.
    const link = within(screen.getByRole('main')).getByRole('link', { name: CONTACTO.email });
    expect(link).toHaveAttribute('href', `mailto:${CONTACTO.email}`);
    expect(link.textContent).toBe(CONTACTO.email);
  });

  it('Sobre não mostra números que não foram confirmados', () => {
    renderPagina(<Sobre />);

    // Estes quatro estavam na página antiga e contradiziam os números reais
    // da landing. Só entram números vindos de provaData.ts.
    expect(screen.queryByText(/500\+/)).toBeNull();
    expect(screen.queryByText(/200\+/)).toBeNull();
    expect(screen.queryByText(/24\/7/)).toBeNull();
    expect(screen.getByText('empresas a gerir a frota no WeGest')).toBeTruthy();
  });

  it('Sobre fala do software e não de recrutar motoristas', () => {
    renderPagina(<Sobre />);
    const main = screen.getByRole('main');
    expect(main.textContent).not.toMatch(/melhores condições para desenvolverem a sua atividade/i);
    expect(main.textContent).toMatch(/renting, rent-a-car e TVDE/i);
  });

  it('FAQ reutiliza as objeções da landing em vez de as duplicar', () => {
    renderPagina(<FAQ />);

    // Se a resposta sobre migração mudar na landing, muda aqui também.
    expect(screen.getByText(OBJECOES.perguntas[0].pergunta)).toBeTruthy();

    // E já não fala do funil de motoristas.
    expect(screen.queryByText(/Preciso ter empresa para trabalhar convosco/i)).toBeNull();
    expect(screen.queryByText(/diferença entre Aluguer e Slot/i)).toBeNull();
  });

  it('Termos avisam que aguardam revisão jurídica', () => {
    renderPagina(<Termos />);
    const aviso = screen.getByRole('note');
    expect(aviso.textContent).toMatch(/revisão jurídica/i);

    // E regulam software, não aluguer de viatura a motoristas.
    const main = screen.getByRole('main');
    expect(main.textContent).toMatch(/plataforma WeGest/i);
    expect(main.textContent).not.toMatch(/carta de condução válida categoria B/i);
  });

  it('Cookies descreve as ferramentas que realmente correm', () => {
    renderPagina(<Cookies />);
    const main = screen.getByRole('main');

    expect(main.textContent).toMatch(/Google Tag Manager/);
    expect(main.textContent).toMatch(/Meta Pixel/);
    // A sessão é guardada em localStorage, não num cookie — a página di-lo.
    expect(main.textContent).toMatch(/localStorage/);
  });

  it('Privacidade encaminha para a política de cookies', () => {
    renderPagina(<Privacidade />);

    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: /Política de Cookies/i })).toHaveAttribute(
      'href',
      '/cookies'
    );

    // A âncora antiga é mantida: links antigos apontam para ela.
    expect(document.getElementById('cookies')).toBeTruthy();
  });

  it('EliminarConta mantém a confirmação obrigatória antes de submeter', () => {
    renderPagina(<EliminarConta />);

    const botao = screen.getByRole('button', { name: /Solicitar eliminação da conta/i });
    expect(botao).toBeDisabled();
    expect(screen.getByLabelText(/Email da conta/i)).toBeRequired();
  });
});
