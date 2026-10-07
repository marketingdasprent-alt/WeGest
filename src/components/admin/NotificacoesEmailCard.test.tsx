import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { NotificacoesEmailCard } from './NotificacoesEmailCard';

const EMAIL = {
  id: 'e1',
  email: 'contabilidade@fora.pt',
  nome: 'Contabilidade',
  ativo: true,
  tipos: ['viatura.seguro_expirando'],
};

const GRUPOS = [
  {
    modulo: 'Viaturas',
    tipos: [
      {
        eventType: 'viatura.seguro_expirando',
        label: 'Seguro a expirar',
        modulo: 'Viaturas',
        temAccaoEmail: true,
      },
      {
        eventType: 'viatura.iuc_a_pagar',
        label: 'IUC a pagar',
        modulo: 'Viaturas',
        temAccaoEmail: true,
      },
    ],
  },
  {
    modulo: 'Financeiro',
    tipos: [
      {
        eventType: 'cobranca.gerada',
        label: 'Cobrança gerada',
        modulo: 'Financeiro',
        temAccaoEmail: false,
      },
    ],
  },
];

describe('NotificacoesEmailCard', () => {
  it('mostra o email e marca os tipos subscritos', () => {
    render(
      <NotificacoesEmailCard
        email={EMAIL}
        grupos={GRUPOS}
        onAlternarTipo={() => {}}
        onAtivar={() => {}}
        onRemover={() => {}}
      />
    );
    expect(screen.getByText('contabilidade@fora.pt')).not.toBeNull();
    expect(screen.getByLabelText('Seguro a expirar').getAttribute('data-state')).toBe('checked');
    expect(screen.getByLabelText('IUC a pagar').getAttribute('data-state')).toBe('unchecked');
  });

  it('um tipo sem acção de email fica desligado e diz porquê', () => {
    render(
      <NotificacoesEmailCard
        email={EMAIL}
        grupos={GRUPOS}
        onAlternarTipo={() => {}}
        onAtivar={() => {}}
        onRemover={() => {}}
      />
    );
    const caixa = screen.getByLabelText(/Cobrança gerada/);
    expect(caixa.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Sem acção de email no editor de Automação')).not.toBeNull();
  });

  it('ligar e desligar um tipo chama o handler com o estado novo', () => {
    const onAlternarTipo = vi.fn();
    render(
      <NotificacoesEmailCard
        email={EMAIL}
        grupos={GRUPOS}
        onAlternarTipo={onAlternarTipo}
        onAtivar={() => {}}
        onRemover={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText('IUC a pagar'));
    expect(onAlternarTipo).toHaveBeenCalledWith('viatura.iuc_a_pagar', true);
    fireEvent.click(screen.getByLabelText('Seguro a expirar'));
    expect(onAlternarTipo).toHaveBeenCalledWith('viatura.seguro_expirando', false);
  });

  it('com o email inativo as caixas ficam desligadas', () => {
    render(
      <NotificacoesEmailCard
        email={{ ...EMAIL, ativo: false }}
        grupos={GRUPOS}
        onAlternarTipo={() => {}}
        onAtivar={() => {}}
        onRemover={() => {}}
      />
    );
    expect(screen.getByLabelText('IUC a pagar').hasAttribute('disabled')).toBe(true);
  });

  it('remover chama o handler', () => {
    const onRemover = vi.fn();
    render(
      <NotificacoesEmailCard
        email={EMAIL}
        grupos={GRUPOS}
        onAlternarTipo={() => {}}
        onAtivar={() => {}}
        onRemover={onRemover}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remover contabilidade@fora.pt' }));
    expect(onRemover).toHaveBeenCalledTimes(1);
  });
});
