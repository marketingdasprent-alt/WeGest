import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

import { supabase } from '@/integrations/supabase/client';
import { MotoristaCombustivelCard } from './MotoristaCombustivelCard';

/** Query builder falso que regista as chamadas por tabela e resolve sem linhas. */
function mockarTabelas(chamadas: Record<string, Array<[string, unknown[]]>>) {
  (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
    chamadas[tabela] = [];
    const builder: unknown = new Proxy(
      {},
      {
        get(_alvo, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: { data: unknown[]; error: null }) => void) =>
              resolve({ data: [], error: null });
          }
          return (...args: unknown[]) => {
            chamadas[tabela].push([prop, args]);
            return builder;
          };
        },
      }
    );
    return builder;
  });
}

describe('MotoristaCombustivelCard — corte das contas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('os abastecimentos de BP, Repsol e EDP só vêm desde 26/10', async () => {
    const chamadas: Record<string, Array<[string, unknown[]]>> = {};
    mockarTabelas(chamadas);

    render(<MotoristaCombustivelCard motoristaId="m1" />);
    await waitFor(() => expect(Object.keys(chamadas)).toHaveLength(3));

    const desde = new Date('2026-10-26T00:00:00').toISOString();
    for (const tabela of ['bp_transacoes', 'repsol_transacoes', 'edp_transacoes']) {
      expect(chamadas[tabela]).toContainEqual(['gte', ['transaction_date', desde]]);
    }
  });
});
