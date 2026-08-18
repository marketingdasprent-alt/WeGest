import { describe, it, expect, afterEach, vi } from 'vitest';
import { linkListaTickets, tokenDoDominioTickets } from './ticketsUrl';

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Põe o domínio de pedidos configurado, como está em produção. */
function comDominioConfigurado() {
  vi.stubEnv('VITE_TICKETS_HOST', 'tickets.wegest.pt');
  vi.stubEnv('VITE_TICKETS_TOKEN', 'token-da-decada');
}

describe('tokenDoDominioTickets', () => {
  it('no dominio de pedidos devolve o token configurado', () => {
    comDominioConfigurado();
    expect(tokenDoDominioTickets('tickets.wegest.pt')).toBe('token-da-decada');
  });

  // É isto que impede a raiz do www.wegest.pt de passar a mostrar o formulário
  // de pedidos em vez da página inicial.
  it('noutro dominio devolve null', () => {
    comDominioConfigurado();
    expect(tokenDoDominioTickets('www.wegest.pt')).toBeNull();
    expect(tokenDoDominioTickets('decada.wegest.pt')).toBeNull();
  });

  it('sem configuracao devolve null mesmo no dominio certo', () => {
    vi.stubEnv('VITE_TICKETS_HOST', '');
    vi.stubEnv('VITE_TICKETS_TOKEN', '');
    expect(tokenDoDominioTickets('tickets.wegest.pt')).toBeNull();
  });
});

describe('linkListaTickets', () => {
  // REGRESSÃO 2026-08-18: o botão do dashboard passou a abrir
  // https://tickets.wegest.pt, uma origem diferente de www.wegest.pt. A sessão
  // do Supabase vive em localStorage, que é por origem, por isso o admin
  // chegava lá anónimo e a lista de pedidos desaparecia — sem erro nenhum.
  // Este link é a porta de entrada do admin: tem de ficar na mesma origem.
  it('fica sempre relativo, mesmo com o dominio de pedidos configurado', () => {
    comDominioConfigurado();
    const link = linkListaTickets('token-da-decada');
    expect(link).toBe('/ti/token-da-decada');
    expect(link).not.toMatch(/^https?:\/\//);
  });

  it('fica relativo para qualquer organizacao', () => {
    comDominioConfigurado();
    expect(linkListaTickets('token-de-outro')).toBe('/ti/token-de-outro');
  });

  it('sem configuracao nenhuma continua relativo', () => {
    expect(linkListaTickets('abc-123')).toBe('/ti/abc-123');
  });
});
