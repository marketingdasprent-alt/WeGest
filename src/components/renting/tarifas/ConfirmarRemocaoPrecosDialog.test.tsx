import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmarRemocaoPrecosDialog } from './ConfirmarRemocaoPrecosDialog';

const MENSAGEM =
  'Preço em uso em contratos abertos: Astra — contrato #16 (BT-21-UN). Se gravares, esses contratos ficam sem preço.';

describe('ConfirmarRemocaoPrecosDialog', () => {
  it('fechado quando não há remoção pendente', () => {
    render(
      <ConfirmarRemocaoPrecosDialog mensagem={null} onCancelar={vi.fn()} onConfirmar={vi.fn()} />
    );

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('mostra os contratos afectados que vêm da base de dados', () => {
    render(
      <ConfirmarRemocaoPrecosDialog
        mensagem={MENSAGEM}
        onCancelar={vi.fn()}
        onConfirmar={vi.fn()}
      />
    );

    expect(screen.getByRole('alertdialog').textContent).toContain(MENSAGEM);
  });

  it('gravar mesmo assim confirma, e só isso', () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    render(
      <ConfirmarRemocaoPrecosDialog
        mensagem={MENSAGEM}
        onCancelar={onCancelar}
        onConfirmar={onConfirmar}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gravar mesmo assim' }));

    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onCancelar).not.toHaveBeenCalled();
  });

  it('cancelar não grava', () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    render(
      <ConfirmarRemocaoPrecosDialog
        mensagem={MENSAGEM}
        onCancelar={onCancelar}
        onConfirmar={onConfirmar}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancelar).toHaveBeenCalled();
    expect(onConfirmar).not.toHaveBeenCalled();
  });
});
