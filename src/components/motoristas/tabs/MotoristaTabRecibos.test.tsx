import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./MotoristaRecibosSection', () => ({
  MotoristaRecibosSection: () => null,
}));

import { MotoristaTabRecibos } from './MotoristaTabRecibos';

describe('MotoristaTabRecibos', () => {
  beforeEach(() => {
    // Quarta-feira, 2026-07-15 — semana em curso é 13/07-19/07;
    // a semana fechada anterior é 06/07-12/07.
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('abre por default na última semana fechada, não na semana em curso', () => {
    render(<MotoristaTabRecibos motorista={{ id: 'm1' } as any} />);
    expect(screen.getByText(/06 jul - 12 jul/i)).toBeInTheDocument();
    expect(screen.queryByText(/13 jul - 19 jul/i)).not.toBeInTheDocument();
  });
});
