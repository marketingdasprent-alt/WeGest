import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { GrupoPrevisto } from '@/lib/verComoGrupo';

const m = vi.hoisted(() => ({
  isAdmin: true,
  verComo: null as GrupoPrevisto | null,
}));

vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissionsContext: () => ({ isAdmin: m.isAdmin, verComo: m.verComo, loading: false }),
}));
vi.mock('@/contexts/TenantContext', () => ({ useOrgId: () => 'org-a' }));
vi.mock('@/hooks/useCargosPrevisiveis', () => ({
  useCargosPrevisiveis: () => ({ data: [{ id: 'c-tvde', nome: 'Gestor TVDE' }] }),
}));

import { VerComoGrupo } from './VerComoGrupo';
import { guardarVerComoGrupo, lerVerComoGrupo } from '@/lib/verComoGrupo';

beforeEach(() => {
  localStorage.clear();
  m.isAdmin = true;
  m.verComo = null;
});

describe('VerComoGrupo', () => {
  it('não aparece a quem não é admin', () => {
    m.isAdmin = false;
    const { container } = render(<VerComoGrupo onMudou={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('ao admin mostra a vista normal, sem botão de sair', () => {
    render(<VerComoGrupo onMudou={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: /ver como grupo/i }).textContent).toContain(
      'Eu (admin)'
    );
    expect(screen.queryByRole('button', { name: /sair/i })).toBeNull();
  });

  it('durante a pré-visualização (isAdmin=false) continua lá, diz o grupo e deixa sair', () => {
    m.isAdmin = false;
    m.verComo = { id: 'c-tvde', nome: 'Gestor TVDE' };
    guardarVerComoGrupo('org-a', 'c-tvde');
    const onMudou = vi.fn();
    render(<VerComoGrupo onMudou={onMudou} />);

    expect(screen.getByRole('combobox', { name: /ver como grupo/i }).textContent).toContain(
      'Gestor TVDE'
    );
    fireEvent.click(screen.getByRole('button', { name: /sair da pré-visualização/i }));
    expect(lerVerComoGrupo('org-a')).toBeNull();
    expect(onMudou).toHaveBeenCalledOnce();
  });
});
