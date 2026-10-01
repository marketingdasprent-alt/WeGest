import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { recebido } = vi.hoisted(() => ({ recebido: { configuracao: null as unknown } }));

vi.mock('@scalar/api-reference-react', () => ({
  ApiReferenceReact: ({ configuration }: { configuration: { url: string } }) => {
    recebido.configuracao = configuration;
    return <div data-testid="scalar">{configuration.url}</div>;
  },
}));
vi.mock('@scalar/api-reference-react/style.css', () => ({}));

import ApiDocsPage from './ApiDocsPage';
import { CONFIGURACAO_BASE, urlDaEspecificacao } from '@/lib/apiDocs';

describe('ApiDocsPage', () => {
  it('aponta para o openapi.json da função no projecto Supabase', () => {
    expect(urlDaEspecificacao('https://abc.supabase.co')).toBe(
      'https://abc.supabase.co/functions/v1/api-rent-a-car/v1/openapi.json'
    );
    expect(urlDaEspecificacao('https://abc.supabase.co/')).toBe(
      'https://abc.supabase.co/functions/v1/api-rent-a-car/v1/openapi.json'
    );
  });

  it('renderiza o leitor com esse URL', () => {
    render(<ApiDocsPage />);
    expect(screen.getByTestId('scalar').textContent).toContain('/api-rent-a-car/v1/openapi.json');
  });

  it('nada sai para a Scalar: sem telemetria, fontes, proxy, agente, MCP nem chave persistida', () => {
    render(<ApiDocsPage />);
    const c = recebido.configuracao as Record<string, unknown>;
    expect(c.telemetry).toBe(false);
    expect(c.withDefaultFonts).toBe(false);
    expect(c.proxyUrl).toBe('');
    expect(c.persistAuth).toBe(false);
    expect(c.agent).toEqual({ disabled: true });
    expect(c.mcp).toEqual({ disabled: true });
    expect(c.showDeveloperTools).toBe('never');
    expect(CONFIGURACAO_BASE.telemetry).toBe(false);
  });

  it('avisa para usar só chave de teste e que a whitelist só vale no URL directo', () => {
    render(<ApiDocsPage />);
    expect(screen.getByText(/chave de teste/i)).toBeTruthy();
    expect(screen.getByText(/IP visto é o da Vercel/i)).toBeTruthy();
  });
});
