import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface HeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

describe('headers HTTP', () => {
  it('aplica defesas de browser a todas as rotas', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      headers: HeaderRule[];
    };
    const globalRule = config.headers.find((rule) => rule.source === '/(.*)');
    const headers = new Map(globalRule?.headers.map(({ key, value }) => [key, value]));

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Permissions-Policy')).toContain('microphone=()');
    expect(headers.get('Content-Security-Policy-Report-Only')).toContain("default-src 'self'");
  });
});
