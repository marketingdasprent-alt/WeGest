import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AbastecimentosSuspeitosAviso } from './AbastecimentosSuspeitosAviso';

const SUSPEITO = {
  id: 't1',
  data: '2026-09-23T12:23:00+00:00',
  valor: 100,
  imputadoId: 'luiz',
  matricula: 'BT-29-UI',
  titularesIds: ['gurbhej'],
};
const NOMES = { luiz: 'Luiz Rezende', gurbhej: 'Gurbhej Singh' };

describe('AbastecimentosSuspeitosAviso', () => {
  it('sem casos, não aparece', () => {
    const { container } = render(<AbastecimentosSuspeitosAviso suspeitos={[]} nomes={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('diz quantos e quanto, e "Ver quais" mostra quem pagou e quem tinha o carro', () => {
    render(<AbastecimentosSuspeitosAviso suspeitos={[SUSPEITO]} nomes={NOMES} />);
    expect(screen.getByRole('status').textContent).toContain('1 abastecimento');
    expect(screen.getByRole('status').textContent).toContain('100,00');
    expect(screen.queryByText('Gurbhej Singh')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ver quais' }));
    expect(screen.getByText('Luiz Rezende')).not.toBeNull();
    expect(screen.getByText('Gurbhej Singh')).not.toBeNull();
    expect(screen.getByText('BT-29-UI')).not.toBeNull();
    expect(screen.getByText('23/09 12:23')).not.toBeNull();
  });
});
