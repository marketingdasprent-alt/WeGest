import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface HeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

// A regra geral cobre tudo menos /formulario/ e o portal do motorista: o
// formulário vive num iframe no site de cada organização e o portal (com o
// /login) no site da Década, cada um com a sua regra, sem X-Frame-Options.
// Qualquer outra rota continua fechada a iframes.
const REGRA_GERAL = '/((?!formulario/|motorista/|login$).*)';
const REGRA_FORMULARIO = '/formulario/(.*)';
const REGRA_PORTAL_MOTORISTA = '/(motorista/.*|login)';
const SITE_DECADA = 'https://www.decadaousada.pt https://decadaousada.pt';

const lerConfig = () =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
    headers: HeaderRule[];
  };

describe('headers HTTP', () => {
  it('aplica defesas de browser a todas as rotas', () => {
    const config = lerConfig();
    const globalRule = config.headers.find((rule) => rule.source === REGRA_GERAL);
    const headers = new Map(globalRule?.headers.map(({ key, value }) => [key, value]));

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Permissions-Policy')).toContain('microphone=()');
    expect(headers.get('Content-Security-Policy-Report-Only')).toContain("default-src 'self'");
  });

  it('a CSP deixa carregar o CAPTCHA dos formulários públicos (Turnstile)', () => {
    const config = lerConfig();
    const csp =
      config.headers
        .find((rule) => rule.source === REGRA_GERAL)
        ?.headers.find(({ key }) => key === 'Content-Security-Policy-Report-Only')?.value ?? '';
    const diretiva = (nome: string) =>
      csp
        .split(';')
        .map((parte) => parte.trim())
        .find((parte) => parte.startsWith(`${nome} `)) ?? '';

    expect(diretiva('script-src')).toContain('https://challenges.cloudflare.com');
    expect(diretiva('frame-src')).toContain('https://challenges.cloudflare.com');
  });
});

describe('formulário público incorporável no site da organização', () => {
  it('/formulario/ pode ir num iframe; o resto do site continua fechado', () => {
    const config = lerConfig();
    const regra = config.headers.find((rule) => rule.source === REGRA_FORMULARIO);
    const headers = new Map(regra?.headers.map(({ key, value }) => [key, value]));

    expect(regra).toBeDefined();
    expect(headers.has('X-Frame-Options')).toBe(false);
    expect(headers.get('Content-Security-Policy')).toContain('frame-ancestors *');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    // A regra geral tem de excluir /formulario/, senão o DENY dela sobrepunha-se.
    expect(REGRA_GERAL).toContain('(?!formulario/');
  });
});

describe('CSP da documentação da API', () => {
  it('a Referência interactiva pode ler e experimentar api.wegest.pt', () => {
    const config = lerConfig();
    const csp =
      config.headers
        .find((rule) => rule.source === REGRA_GERAL)
        ?.headers.find(({ key }) => key === 'Content-Security-Policy-Report-Only')?.value ?? '';
    const connect = csp
      .split(';')
      .map((parte) => parte.trim())
      .find((parte) => parte.startsWith('connect-src '));
    expect(connect).toContain('https://api.wegest.pt');
  });
});

describe('portal do motorista embebido no site da Década', () => {
  // A Vercel ancora o source no caminho inteiro.
  const casa = (source: string, caminho: string) => new RegExp(`^${source}$`).test(caminho);

  it('só o site da Década pode pôr o portal e o /login num iframe', () => {
    const config = lerConfig();
    const regra = config.headers.find((rule) => rule.source === REGRA_PORTAL_MOTORISTA);
    const headers = new Map(regra?.headers.map(({ key, value }) => [key, value]));

    expect(regra).toBeDefined();
    expect(headers.has('X-Frame-Options')).toBe(false);
    expect(headers.get('Content-Security-Policy')).toBe(`frame-ancestors 'self' ${SITE_DECADA}`);
    expect(headers.get('Content-Security-Policy')).not.toContain('*');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Content-Security-Policy-Report-Only')).toContain("default-src 'self'");
  });

  it.each(['/motorista/painel', '/motorista/painel/acordos/abc', '/motorista/registo', '/login'])(
    '%s fica na regra do portal e fora do DENY',
    (caminho) => {
      expect(casa(REGRA_PORTAL_MOTORISTA, caminho)).toBe(true);
      expect(casa(REGRA_GERAL, caminho)).toBe(false);
    }
  );

  it.each(['/motoristas', '/motoristas/candidaturas', '/equipa', '/login-x', '/', '/viaturas'])(
    '%s (área da equipa e o resto) continua com X-Frame-Options DENY',
    (caminho) => {
      expect(casa(REGRA_GERAL, caminho)).toBe(true);
      expect(casa(REGRA_PORTAL_MOTORISTA, caminho)).toBe(false);
    }
  );
});
