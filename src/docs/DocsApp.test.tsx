import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { recebido } = vi.hoisted(() => ({ recebido: { configuracao: null as unknown } }));

vi.mock('@scalar/api-reference-react', () => ({
  ApiReferenceReact: ({ configuration }: { configuration: Record<string, unknown> }) => {
    recebido.configuracao = configuration;
    return <div data-testid="scalar" />;
  },
}));
vi.mock('@scalar/api-reference-react/style.css', () => ({}));

// O ScrollArea do Radix precisa de ResizeObserver, que o jsdom não tem.
class ObservadorFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ObservadorFalso as unknown as typeof ResizeObserver;

import DocsApp from './DocsApp';
import { PAGINAS } from './lib/navegacao';
import { OPENAPI } from '../../supabase/functions/_shared/api-rent-a-car/openapi';

function abrir(caminho: string, base: '' | '/docs' = '/docs') {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <DocsApp base={base} />
    </MemoryRouter>
  );
}

const conteudo = () => within(document.getElementById('conteudo') as HTMLElement);

describe('DocsApp', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(OPENAPI), { status: 200 }))
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('todas as páginas da navegação abrem, nenhuma cai no 404', async () => {
    for (const p of PAGINAS.filter((x) => !x.externo)) {
      const { unmount } = abrir(`/docs/${p.slug}`);
      await waitFor(() =>
        expect(conteudo().getByRole('heading', { level: 1 }), p.slug || 'introducao').toBeTruthy()
      );
      expect(screen.queryByText('Esta página não existe.'), p.slug).toBeNull();
      unmount();
    }
  });

  it('em docs.wegest.pt as páginas vivem na raiz e os links não levam /docs', () => {
    abrir('/erros', '');
    expect(conteudo().getByRole('heading', { level: 1, name: 'Erros' })).toBeTruthy();
    const intro = screen.getByRole('link', { name: /WeGest\s*Docs/ });
    expect(intro.getAttribute('href')).toBe('/');
  });

  it('caminho desconhecido mostra o 404 da documentação, com pesquisa e Introdução', () => {
    abrir('/docs/nao-existe');
    expect(screen.getByText('Esta página não existe.')).toBeTruthy();
    expect(conteudo().getByRole('button', { name: 'Pesquisar' })).toBeTruthy();
    expect(conteudo().getByRole('link', { name: 'Introdução' })).toBeTruthy();
  });

  it('Reservas é página de recurso, com criar, consultar e cancelar', () => {
    abrir('/docs/recursos/reservas');
    const c = conteudo();
    expect(c.getByRole('heading', { level: 1, name: 'Reservas' })).toBeTruthy();
    expect(screen.queryByText('Reservas chegam na fase C.')).toBeNull();
    const seccao = (id: string) => within(document.getElementById(id) as HTMLElement);
    expect(seccao('criar').getByRole('heading', { level: 2, name: '/v1/reservas' })).toBeTruthy();
    for (const id of ['consultar', 'cancelar']) {
      expect(
        seccao(id).getByRole('heading', { level: 2, name: '/v1/reservas/{codigo}' }),
        id
      ).toBeTruthy();
    }
    expect(seccao('criar').getByText('reservas:write')).toBeTruthy();
    expect(seccao('consultar').getByText('reservas:read')).toBeTruthy();
  });

  it('TVDE é página de recurso: modelos, detalhe e disponibilidade com tvde:catalogo:read', () => {
    abrir('/docs/recursos/tvde');
    const c = conteudo();
    expect(c.getByRole('heading', { level: 1, name: 'TVDE' })).toBeTruthy();
    expect(c.getByText(/Carros para aluguer semanal a motoristas TVDE/)).toBeTruthy();
    expect(document.getElementById('objecto')).toBeTruthy();
    const seccao = (id: string) => within(document.getElementById(id) as HTMLElement);
    const titulos: [string, string][] = [
      ['listar', '/v1/tvde/modelos'],
      ['obter', '/v1/tvde/modelos/{id}'],
      ['disponibilidade', '/v1/tvde/disponibilidade'],
    ];
    for (const [id, nome] of titulos) {
      expect(seccao(id).getByRole('heading', { level: 2, name: nome }), id).toBeTruthy();
      expect(seccao(id).getByText('tvde:catalogo:read'), id).toBeTruthy();
    }
  });

  it('POST /reservas mostra primeiro o 201 (criada), não o 200 (repetida)', () => {
    abrir('/docs/recursos/reservas');
    const criar = within(document.getElementById('criar') as HTMLElement);
    // A linha "Resposta" do texto e o separador aberto no cartão de código.
    expect(
      criar.getByText((_, el) => el?.tagName === 'P' && el.textContent === '201 — Reserva')
    ).toBeTruthy();
    expect(criar.getByRole('tab', { name: '201', selected: true })).toBeTruthy();
    expect(criar.getByRole('tab', { name: '200', selected: false })).toBeTruthy();
  });
});

describe('página de recurso', () => {
  it('Modelos: objecto, uma secção por operação, permissão, X-API-Key e erros com link', () => {
    abrir('/docs/recursos/modelos');
    const c = conteudo();
    expect(c.getByRole('heading', { level: 1, name: 'Modelos' })).toBeTruthy();
    expect(document.getElementById('objecto')).toBeTruthy();
    const listar = within(document.getElementById('listar') as HTMLElement);
    const obter = within(document.getElementById('obter') as HTMLElement);
    expect(listar.getByRole('heading', { level: 2, name: '/v1/modelos' })).toBeTruthy();
    expect(obter.getByRole('heading', { level: 2, name: '/v1/modelos/{id}' })).toBeTruthy();
    expect(listar.getByText('catalogo:read')).toBeTruthy();
    expect(listar.getByText('X-API-Key')).toBeTruthy();
    // A lista liga ao objecto da página; o detalhe tem os seus atributos.
    expect(listar.getByRole('link', { name: 'Lista de Modelo' }).getAttribute('href')).toBe(
      '#objecto'
    );
    expect(obter.getByText(/Mostrar \d+ atributos/)).toBeTruthy();
    const erro = obter.getByRole('link', { name: 'NAO_ENCONTRADO' });
    expect(erro.getAttribute('href')).toBe('/docs/erros#NAO_ENCONTRADO');
  });

  it('os exemplos usam https://api.wegest.pt/v1 e a chave vem do ambiente', () => {
    abrir('/docs/recursos/modelos');
    const pedido = (document.getElementById('obter') as HTMLElement).textContent ?? '';
    expect(pedido).toContain('https://api.wegest.pt/v1/modelos/');
    expect(pedido).toContain('$WEGEST_API_KEY');
    expect(pedido).not.toMatch(/wg_ra_[A-Za-z0-9]{8,}/);
  });

  it('Health não tem objecto: mostra os atributos da resposta e qualquer chave serve', () => {
    abrir('/docs/recursos/health');
    expect(document.getElementById('objecto')).toBeNull();
    const estado = within(document.getElementById('estado') as HTMLElement);
    expect(estado.getByText('qualquer chave válida')).toBeTruthy();
    expect(estado.getByText(/Mostrar 5 atributos/)).toBeTruthy();
  });
});

describe('Referência interactiva', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lê a especificação de api.wegest.pt e nada sai para a Scalar', async () => {
    const pedido = vi.fn(async () => new Response(JSON.stringify(OPENAPI), { status: 200 }));
    vi.stubGlobal('fetch', pedido);
    abrir('/docs/referencia');
    await screen.findByTestId('scalar');
    expect(String((pedido.mock.calls[0] as unknown[])[0])).toBe(
      'https://api.wegest.pt/v1/openapi.json'
    );
    const c = recebido.configuracao as Record<string, unknown>;
    expect(c.content).toEqual(OPENAPI);
    expect(c.telemetry).toBe(false);
    expect(c.withDefaultFonts).toBe(false);
    expect(c.proxyUrl).toBe('');
    expect(c.persistAuth).toBe(false);
    expect(c.agent).toEqual({ disabled: true });
    expect(c.mcp).toEqual({ disabled: true });
    expect(c.showDeveloperTools).toBe('never');
    expect(c.hideDarkModeToggle).toBe(true);
    // Sem exemplos de browser (levavam a chave literal); ficam node, shell e php.
    expect(c.hiddenClients).toEqual({ js: true });
    expect(c.forceDarkModeState).toBe('light');
    expect(String(c.customCss)).toContain('hsl(var(--primary-text))');
  });

  it('avisa para usar só chave de testes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 }))
    );
    abrir('/docs/referencia');
    expect(
      screen.getByText(/só com permissões de leitura \(catalogo:read, disponibilidade:read\)/)
    ).toBeTruthy();
    expect(screen.getByText(/nunca uma com reservas:write/)).toBeTruthy();
    await screen.findByTestId('scalar');
  });

  it('se a especificação falha: erro, Tentar de novo e Descarregar OpenAPI', async () => {
    const pedido = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify(OPENAPI), { status: 200 }));
    vi.stubGlobal('fetch', pedido);
    abrir('/docs/referencia');
    expect(await screen.findByText('Não foi possível carregar a especificação.')).toBeTruthy();
    expect(
      conteudo()
        .getByRole('link', { name: /Descarregar OpenAPI/ })
        .getAttribute('href')
    ).toBe('https://api.wegest.pt/v1/openapi.json');
    conteudo().getByRole('button', { name: 'Tentar de novo' }).click();
    await screen.findByTestId('scalar');
    expect(pedido).toHaveBeenCalledTimes(2);
  });
});
