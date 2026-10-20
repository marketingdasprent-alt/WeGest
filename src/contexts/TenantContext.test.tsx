import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

const DECADA = {
  id: 'org-decada',
  nome: 'Década Ousada',
  codigo: 'decada',
  logo_url: null,
  ativa: true,
};
const PREMIUM = {
  id: 'org-premium',
  nome: 'PREMIUM RIDE',
  codigo: 'premium',
  logo_url: null,
  ativa: true,
};

const m = vi.hoisted(() => ({
  orgsFalham: false,
  orgAtiva: 'org-decada' as string | null,
  // Cada render da sonda: "orgs/orgId", para apanhar estados intermédios.
  vistos: [] as string[],
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-ines' }, loading: false }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const resultado = (tabela: string) => {
    if (tabela === 'user_organizacoes') {
      return m.orgsFalham
        ? { data: null, error: { message: 'schema cache', code: 'PGRST002' } }
        : {
            data: [
              { org_id: 'org-decada', organizacoes: { ...DECADA } },
              { org_id: 'org-premium', organizacoes: { ...PREMIUM } },
            ],
            error: null,
          };
    }
    if (tabela === 'user_org_ativa') {
      return { data: m.orgAtiva ? { org_id: m.orgAtiva } : null, error: null };
    }
    return { data: null, error: null };
  };
  return {
    supabase: {
      from: (tabela: string) => {
        const res = resultado(tabela);
        const cadeia: Record<string, unknown> = {
          single: () => Promise.resolve(res),
          maybeSingle: () => Promise.resolve(res),
          then: (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) =>
            Promise.resolve(res).then(ok, falha),
        };
        for (const metodo of ['select', 'eq', 'upsert']) cadeia[metodo] = () => cadeia;
        return cadeia;
      },
    },
  };
});

import { TenantProvider, useTenant } from './TenantContext';

function Sonda() {
  const { orgs, orgId, loading } = useTenant();
  if (!loading) m.vistos.push(`${orgs.length}/${orgId ?? 'null'}`);
  return <p data-testid="org">{loading ? 'a carregar' : (orgId ?? 'sem org')}</p>;
}

const montar = () =>
  render(
    <TenantProvider>
      <Sonda />
    </TenantProvider>
  );

const voltarAAba = () =>
  act(async () => {
    window.dispatchEvent(new Event('focus'));
  });

beforeEach(() => {
  sessionStorage.clear();
  m.orgsFalham = false;
  m.orgAtiva = 'org-decada';
  m.vistos.length = 0;
});

describe('TenantContext', () => {
  it('usa a empresa gravada na conta', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('org-decada'));
  });

  it('primeira carga falhou (API em baixo): ao voltar à aba resolve a empresa gravada', async () => {
    m.orgsFalham = true;
    montar();
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('sem org'));

    m.orgsFalham = false;
    await voltarAAba();

    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('org-decada'));
    // Nunca houve "2 empresas e nenhuma escolhida": era isso que mandava a
    // Inês para o Selecionar Empresa.
    expect(m.vistos).not.toContain('2/null');
  });

  it('aba já resolvida: voltar à aba não troca a empresa, mesmo que a conta mude noutra aba', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('org-decada'));

    m.orgAtiva = 'org-premium';
    await voltarAAba();

    expect(screen.getByTestId('org').textContent).toBe('org-decada');
  });

  it('várias empresas e nenhuma gravada: fica sem empresa para a pessoa escolher', async () => {
    m.orgAtiva = null;
    montar();
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('sem org'));
    expect(m.vistos).toContain('2/null');
  });
});
