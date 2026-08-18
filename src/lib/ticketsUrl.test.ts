import { describe, it, expect, afterEach, vi } from 'vitest';
import { linkSubmissaoTickets, tokenDoDominioTickets } from './ticketsUrl';

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Põe o domínio de pedidos configurado, como estará em produção. */
function comDominioConfigurado() {
  vi.stubEnv('VITE_TICKETS_BASE_URL', 'https://tickets.wegest.pt');
  vi.stubEnv('VITE_TICKETS_HOST', 'tickets.wegest.pt');
  vi.stubEnv('VITE_TICKETS_TOKEN', 'token-da-decada');
}

describe('tokenDoDominioTickets', () => {
  it('no dominio de pedidos devolve o token configurado', () => {
    comDominioConfigurado();
    expect(tokenDoDominioTickets('tickets.wegest.pt')).toBe('token-da-decada');
  });

  // É isto que impede a raiz do wegest.pt de passar a mostrar o formulário de
  // pedidos em vez da página inicial.
  it('noutro dominio devolve null', () => {
    comDominioConfigurado();
    expect(tokenDoDominioTickets('wegest.pt')).toBeNull();
    expect(tokenDoDominioTickets('decada.wegest.pt')).toBeNull();
  });

  it('sem configuracao devolve null mesmo no dominio certo', () => {
    vi.stubEnv('VITE_TICKETS_HOST', '');
    vi.stubEnv('VITE_TICKETS_TOKEN', '');
    expect(tokenDoDominioTickets('tickets.wegest.pt')).toBeNull();
  });
});

describe('linkSubmissaoTickets', () => {
  // O link curto que se partilha: só o domínio, sem token à vista.
  it('para a organizacao do dominio devolve so o dominio', () => {
    comDominioConfigurado();
    expect(linkSubmissaoTickets('token-da-decada')).toBe('https://tickets.wegest.pt');
  });

  // Outra organização não pode receber o link curto: nesse domínio a raiz
  // mostra o formulário da Década Ousada, e os pedidos iam parar à org errada.
  it('para outra organizacao mantem o token no caminho', () => {
    comDominioConfigurado();
    expect(linkSubmissaoTickets('token-de-outro')).toBe(
      'https://tickets.wegest.pt/ti/token-de-outro'
    );
  });

  it('sem configuracao devolve caminho relativo', () => {
    vi.stubEnv('VITE_TICKETS_BASE_URL', '');
    vi.stubEnv('VITE_TICKETS_TOKEN', '');
    expect(linkSubmissaoTickets('abc-123')).toBe('/ti/abc-123');
  });

  it('barra final na base nao duplica a barra do caminho', () => {
    vi.stubEnv('VITE_TICKETS_BASE_URL', 'https://tickets.wegest.pt/');
    vi.stubEnv('VITE_TICKETS_TOKEN', '');
    expect(linkSubmissaoTickets('abc-123')).toBe('https://tickets.wegest.pt/ti/abc-123');
  });
});
