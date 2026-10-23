import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { GrupoPrevisto } from '@/lib/verComoGrupo';

const m = vi.hoisted(() => ({
  podeVerComo: true,
  verComo: null as GrupoPrevisto | null,
}));

vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissionsContext: () => ({
    podeVerComo: m.podeVerComo,
    verComo: m.verComo,
    loading: false,
  }),
}));
vi.mock('@/contexts/TenantContext', () => ({ useOrgId: () => 'org-a' }));
vi.mock('@/hooks/useCargosPrevisiveis', () => ({
  useCargosPrevisiveis: () => ({ data: [{ id: 'c-tvde', nome: 'Gestor TVDE' }] }),
}));

import { VerComoGrupo } from './VerComoGrupo';
import { guardarVerComoGrupo, lerVerComoGrupo } from '@/lib/verComoGrupo';

beforeEach(() => {
  localStorage.clear();
  m.podeVerComo = true;
  m.verComo = null;
});

describe('VerComoGrupo', () => {
  it('não aparece a quem não o pode usar (não admin, ou admin fora do Suporte em produção)', () => {
    m.podeVerComo = false;
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

  it('durante a pré-visualização continua lá, diz o grupo e deixa sair', () => {
    m.podeVerComo = false;
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
