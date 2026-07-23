import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { DanoCategoriaBadge } from './DanoCategoriaBadge';

/**
 * O badge é a única pista visual de que um dano foi classificado (ex.:
 * "Sinistro") — sem isto, danos sinistrados ficam indistinguíveis de danos
 * normais em todas as listagens (viatura, contrato, motorista, ticket).
 */
describe('DanoCategoriaBadge', () => {
  it('mostra o nome da categoria quando definida', () => {
    render(<DanoCategoriaBadge categoria={{ nome: 'Sinistro', cor: '#EC4899' }} />);
    expect(screen.getByText('Sinistro')).toBeTruthy();
  });

  it('não mostra nada quando o dano não tem categoria', () => {
    const { container } = render(<DanoCategoriaBadge categoria={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('não mostra nada quando categoria é undefined', () => {
    const { container } = render(<DanoCategoriaBadge categoria={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
