import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({
  isAdmin: true,
  consultas: [] as string[],
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-thiago' }, loading: false }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ orgId: 'org-a', loading: false }),
}));

// Cada tabela responde com o seu resultado; a cadeia serve .single(), .maybeSingle() e await directo.
vi.mock('@/integrations/supabase/client', () => {
  const resultado = (tabela: string) => {
    switch (tabela) {
      case 'user_organizacoes':
        return {
          data: { is_admin: m.isAdmin, cargo_id: 'c-admin', cargos: { nome: 'Administrador' } },
          error: null,
        };
      case 'profiles':
        return { data: { tipo_utilizador: 'colaborador' }, error: null };
      case 'cargos':
        return { data: { id: 'c-tvde', nome: 'Gestor TVDE' }, error: null };
      case 'cargo_permissoes':
        return { data: [{ recurso_id: 'r-viaturas' }], error: null };
      case 'recursos':
        return { data: [{ id: 'r-viaturas', nome: 'viaturas' }], error: null };
      default:
        return { data: null, error: null };
    }
  };
  return {
    supabase: {
      from: (tabela: string) => {
        m.consultas.push(tabela);
        const res = resultado(tabela);
        const cadeia: Record<string, unknown> = {
          single: () => Promise.resolve(res),
          maybeSingle: () => Promise.resolve(res),
          then: (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) =>
            Promise.resolve(res).then(ok, falha),
        };
        for (const metodo of ['select', 'eq', 'neq', 'in', 'order']) cadeia[metodo] = () => cadeia;
        return cadeia;
      },
    },
  };
});

import { PermissionsProvider, usePermissionsContext } from './PermissionsContext';
import { guardarVerComoGrupo } from '@/lib/verComoGrupo';

function Sonda() {
  const p = usePermissionsContext();
  if (p.loading) return <p>a carregar</p>;
  return (
    <dl>
      <dd data-testid="admin">{String(p.isAdmin)}</dd>
      <dd data-testid="cargo">{p.cargo}</dd>
      <dd data-testid="recursos">{p.recursos.join(',')}</dd>
      <dd data-testid="ver-como">{p.verComo?.nome ?? '—'}</dd>
    </dl>
  );
}

const montar = () =>
  render(
    <PermissionsProvider>
      <Sonda />
    </PermissionsProvider>
  );

beforeEach(() => {
  localStorage.clear();
  m.isAdmin = true;
  m.consultas.length = 0;
});

describe('PermissionsContext — "Ver como grupo"', () => {
  it('admin sem escolha: continua admin', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('admin').textContent).toContain('true'));
    expect(screen.getByTestId('ver-como').textContent).toContain('—');
    expect(m.consultas).not.toContain('cargos');
  });

  it('admin a ver como Gestor TVDE: fica com as permissões e o cargo desse grupo', async () => {
    guardarVerComoGrupo('org-a', 'c-tvde');
    montar();
    await waitFor(() =>
      expect(screen.getByTestId('ver-como').textContent).toContain('Gestor TVDE')
    );
    expect(screen.getByTestId('admin').textContent).toContain('false');
    expect(screen.getByTestId('cargo').textContent).toContain('Gestor TVDE');
    expect(screen.getByTestId('recursos').textContent).toContain('viaturas');
  });

  it('quem não é admin nunca entra em pré-visualização, mesmo com a escolha no browser', async () => {
    guardarVerComoGrupo('org-a', 'c-tvde');
    m.isAdmin = false;
    montar();
    await waitFor(() => expect(screen.getByTestId('admin').textContent).toContain('false'));
    expect(screen.getByTestId('ver-como').textContent).toContain('—');
    expect(m.consultas).not.toContain('cargos');
  });
});
