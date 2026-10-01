import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ContasEmFaltaAviso } from './ContasEmFaltaAviso';

const semana = { inicio: '2026-09-21', fim: '2026-09-27' };

describe('ContasEmFaltaAviso', () => {
  it('nada em falta: não aparece', () => {
    const { container } = render(<ContasEmFaltaAviso faltas={[{ semana, contas: [] }]} />);
    expect(container.firstChild).toBeNull();
  });

  it('o caso de 28/09: a Uber Açores em falta', () => {
    render(
      <ContasEmFaltaAviso
        faltas={[
          {
            semana,
            contas: [{ id: 'acores', nome: 'Uber Açores', nomeEmpresa: null, plataforma: 'uber' }],
          },
        ]}
      />
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Semana 21/09 a 27/09/2026: ainda falta o ficheiro de Uber Açores.'
    );
  });
});
