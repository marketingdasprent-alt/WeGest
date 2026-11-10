import { describe, expect, it } from 'vitest';

import { semanasParaRecibo } from './semanasRecibo';

const hoje = new Date(2026, 10, 10, 12); // terça, 10/11/2026

describe('semanasParaRecibo', () => {
  it('sem data de contratação começa no início das contas (não fica vazia)', () => {
    const s = semanasParaRecibo(null, new Set(), hoje);
    expect(s.map((x) => x.value)).toEqual(['2026-11-09', '2026-11-02', '2026-10-26']);
  });

  it('contratação antiga também começa no início das contas', () => {
    const s = semanasParaRecibo('2026-06-26', new Set(), hoje);
    expect(s.at(-1)?.value).toBe('2026-10-26');
    expect(s[0].value).toBe('2026-11-09');
  });

  it('contratação depois do início das contas começa na semana dela', () => {
    const s = semanasParaRecibo('2026-11-04', new Set(), hoje);
    expect(s.map((x) => x.value)).toEqual(['2026-11-09', '2026-11-02']);
  });

  it('marca as semanas que já têm recibo', () => {
    const s = semanasParaRecibo(null, new Set(['2026-11-02']), hoje);
    expect(s.find((x) => x.value === '2026-11-02')?.jaTemRecibo).toBe(true);
    expect(s.find((x) => x.value === '2026-11-09')?.jaTemRecibo).toBe(false);
  });

  it('aceita data com hora (timestamp)', () => {
    const s = semanasParaRecibo('2026-11-04T00:00:00+00:00', new Set(), hoje);
    expect(s.at(-1)?.value).toBe('2026-11-02');
  });
});
