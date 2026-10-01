import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CartaoTipoViaturaCard } from './CartaoTipoViaturaCard';

describe('CartaoTipoViaturaCard', () => {
  it('SLOT: mostra os com motorista sobre o total, com a legenda', () => {
    render(
      <CartaoTipoViaturaCard
        cartao={{ id: 'slot', nome: 'SLOT', legenda: 'com motorista', destaque: 26, total: 119 }}
        isActive={false}
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText('26')).not.toBeNull();
    expect(screen.getByText('/ 119')).not.toBeNull();
    expect(screen.getByText('SLOT · com motorista')).not.toBeNull();
  });

  it('tipo normal: sem legenda, e o clique chega ao filtro', () => {
    const onClick = vi.fn();
    render(
      <CartaoTipoViaturaCard
        cartao={{ id: 't-tvde', nome: 'TVDE', destaque: 33, total: 170 }}
        isActive
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByText('TVDE'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
