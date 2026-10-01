import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { FrotaAtencaoAviso } from './FrotaAtencaoAviso';

describe('FrotaAtencaoAviso', () => {
  it('sem casos, não aparece', () => {
    const { container } = render(
      <FrotaAtencaoAviso
        vencidas={0}
        aVencer={0}
        activo={false}
        onVer={vi.fn()}
        onVerTodas={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('diz quantas e porquê, e "Ver quais" filtra', () => {
    const onVer = vi.fn();
    render(
      <FrotaAtencaoAviso
        vencidas={4}
        aVencer={8}
        activo={false}
        onVer={onVer}
        onVerTodas={vi.fn()}
      />
    );
    const texto = screen.getByRole('status').textContent ?? '';
    expect(texto).toContain('12 viaturas');
    expect(texto).toContain('4 com documentos vencidos');
    expect(texto).toContain('8 a vencer nos próximos 30 dias');
    fireEvent.click(screen.getByRole('button', { name: 'Ver quais' }));
    expect(onVer).toHaveBeenCalledOnce();
  });

  it('já filtrado, o botão volta a mostrar todas', () => {
    const onVerTodas = vi.fn();
    render(
      <FrotaAtencaoAviso vencidas={1} aVencer={0} activo onVer={vi.fn()} onVerTodas={onVerTodas} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas' }));
    expect(onVerTodas).toHaveBeenCalledOnce();
  });
});
