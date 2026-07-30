import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParcelaStatusBadge } from './ParcelaStatusBadge';

describe('ParcelaStatusBadge', () => {
  it('mostra "Agendada" em âmbar', () => {
    render(<ParcelaStatusBadge estado="agendada" />);
    const badge = screen.getByText('Agendada');
    expect(badge.className).toContain('amber');
  });

  it('mostra "Avisada" em âmbar (mesma cor de agendada, já decidido na spec do backend)', () => {
    render(<ParcelaStatusBadge estado="avisada" />);
    const badge = screen.getByText('Avisada');
    expect(badge.className).toContain('amber');
  });

  it('mostra "Vencida" em vermelho', () => {
    render(<ParcelaStatusBadge estado="vencida" />);
    const badge = screen.getByText('Vencida');
    expect(badge.className).toContain('red');
  });

  it('mostra "Recibo por confirmar" em índigo para liquidacao_pendente', () => {
    render(<ParcelaStatusBadge estado="liquidacao_pendente" />);
    const badge = screen.getByText('Recibo por confirmar');
    expect(badge.className).toContain('indigo');
  });

  it('mostra "Paga" em esmeralda', () => {
    render(<ParcelaStatusBadge estado="paga" />);
    const badge = screen.getByText('Paga');
    expect(badge.className).toContain('emerald');
  });

  it('mostra "Cancelada" em muted', () => {
    render(<ParcelaStatusBadge estado="cancelada" />);
    const badge = screen.getByText('Cancelada');
    expect(badge.className).toContain('muted');
  });
});
