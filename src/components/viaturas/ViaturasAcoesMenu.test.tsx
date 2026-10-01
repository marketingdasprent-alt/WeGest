import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/contexts/TenantContext', () => ({ useOrgId: () => 'org-a' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { ViaturasAcoesMenu } from './ViaturasAcoesMenu';

const abrirMenu = () =>
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais acções da frota' }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });

const montar = (mudar = {}) => {
  const props = {
    onImprimir: vi.fn(),
    onExportarExcel: vi.fn(),
    aImprimir: false,
    semResultados: false,
    onImportado: vi.fn(),
    ...mudar,
  };
  render(<ViaturasAcoesMenu {...props} />);
  return props;
};

describe('ViaturasAcoesMenu', () => {
  it('imprimir e exportar ficam dentro do menu "⋯"', () => {
    const props = montar();
    expect(screen.queryByText('Imprimir lista')).toBeNull();
    abrirMenu();
    fireEvent.click(screen.getByText('Exportar Excel'));
    expect(props.onExportarExcel).toHaveBeenCalledOnce();
  });

  it('"Importar Excel" abre o diálogo de importação', () => {
    montar();
    abrirMenu();
    fireEvent.click(screen.getByText('Importar Excel'));
    expect(screen.getByRole('dialog', { name: 'Importar viaturas' })).not.toBeNull();
  });
});
