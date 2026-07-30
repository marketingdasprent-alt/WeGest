import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AcordoStatusBadge } from './AcordoStatusBadge';

describe('AcordoStatusBadge', () => {
  it('mostra "Ativo" para estado ativo', () => {
    render(<AcordoStatusBadge estado="ativo" />);
    expect(screen.getByText('Ativo')).toBeTruthy();
  });

  it('mostra "Liquidado" para estado liquidado', () => {
    render(<AcordoStatusBadge estado="liquidado" />);
    expect(screen.getByText('Liquidado')).toBeTruthy();
  });

  it('mostra "Incumprimento" para estado incumprimento', () => {
    render(<AcordoStatusBadge estado="incumprimento" />);
    expect(screen.getByText('Incumprimento')).toBeTruthy();
  });

  it('mostra "Cancelado" para estado cancelado', () => {
    render(<AcordoStatusBadge estado="cancelado" />);
    expect(screen.getByText('Cancelado')).toBeTruthy();
  });
});
