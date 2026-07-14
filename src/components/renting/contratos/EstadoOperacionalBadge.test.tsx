import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { EstadoOperacionalBadge } from './EstadoOperacionalBadge';

/**
 * O badge de estado é a única pista visual, na tabela de contratos, de que
 * há uma recolha/devolução agendada mas ainda não confirmada — sem isto, um
 * contrato "em_curso" com recolha pendente parece igual a um contrato normal.
 */
describe('EstadoOperacionalBadge', () => {
  it('mostra só o estado quando não há recolha pendente', () => {
    render(<EstadoOperacionalBadge estado="em_curso" />);
    expect(screen.getByText('Em Curso')).toBeTruthy();
    expect(screen.queryByText('Recolha agendada')).toBeNull();
  });

  it('mostra o indicador "Recolha agendada" quando recolhaPendente=true', () => {
    render(<EstadoOperacionalBadge estado="em_curso" recolhaPendente />);
    expect(screen.getByText('Em Curso')).toBeTruthy();
    expect(screen.getByText('Recolha agendada')).toBeTruthy();
  });
});
