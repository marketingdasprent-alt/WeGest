// src/components/motoristas/tabs/MotoristaRecibosSectionBolt.test.tsx
// Regressão: o recibo do motorista somava a receita Bolt da API (bolt_viagens)
// com a do CSV (bolt_resumos_semanais) e mostrava o dobro do dinheiro.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasAccessToResource: () => true, isAdmin: true }),
}));

// O dialog do resumo é onde os totais calculados saem do componente em bruto —
// stub para os ler sem depender da formatação em euros.
vi.mock('@/components/administrativo/MotoristaResumoDialog', () => ({
  MotoristaResumoDialog: ({ motorista }: any) => (
    <div data-testid="resumo-dialog">{JSON.stringify(motorista)}</div>
  ),
}));

import { MotoristaRecibosSection } from './MotoristaRecibosSection';

/** Query builder falso: encadeia tudo e resolve com as linhas da tabela. */
function criarBuilder(linhas: any[]) {
  const builder: any = new Proxy(
    {},
    {
      get(_alvo, prop) {
        if (prop === 'then') {
          return (resolve: (v: { data: any[]; error: null }) => void) =>
            resolve({ data: linhas, error: null });
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve({ data: linhas[0] ?? null, error: null });
        }
        return () => builder;
      },
    }
  );
  return builder;
}

function mockarTabelas(tabelas: Record<string, any[]>) {
  (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((t: string) =>
    criarBuilder(tabelas[t] ?? [])
  );
}

const tabelasConsultadas = () =>
  (supabase.from as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);

const lerResumo = () => JSON.parse(screen.getByTestId('resumo-dialog').textContent || '{}');

const renderizar = (reciboVerde = true) =>
  render(
    <MotoristaRecibosSection
      motoristaId="m1"
      selectedWeek={new Date('2026-07-08T12:00:00Z')}
      motorista={{ id: 'm1', nome: 'João Silva', recibo_verde: reciboVerde }}
    />
  );

describe('MotoristaRecibosSection — receita Bolt', () => {
  beforeEach(() => {
    mockarTabelas({
      // A API tem 500 € para a mesma semana. Com a fonte em 'csv' este valor
      // não pode entrar no recibo — nem somado, nem a substituir o CSV.
      bolt_viagens: [{ driver_earnings: 500 }],
      bolt_resumos_semanais: [{ ganhos_liquidos: 300 }],
    });
  });

  it('não duplica: mostra só os ganhos do CSV, não a soma com a API', async () => {
    renderizar();
    await waitFor(() => expect(lerResumo().faturado_bolt).toBe(300));
    // 800 = o bug antigo (300 CSV + 500 API); 500 = a API a substituir o CSV.
    const resumo = lerResumo();
    expect(resumo.faturado_bolt).not.toBe(800);
    expect(resumo.total_faturado).toBe(300);
  });

  it('não consulta bolt_viagens enquanto a fonte financeira for o CSV (modo sombra)', async () => {
    renderizar();
    await waitFor(() => expect(lerResumo().faturado_bolt).toBe(300));
    expect(tabelasConsultadas()).toContain('bolt_resumos_semanais');
    expect(tabelasConsultadas()).not.toContain('bolt_viagens');
  });

  it('sem recibo verde aplica ÷1,06 ao valor do CSV (e não a um total duplicado)', async () => {
    renderizar(false);
    await waitFor(() => expect(lerResumo().faturado_bolt).toBe(300));
    // 300 / 1.06 = 283,02 €. Com o bug seria 800 / 1.06 = 754,72 €.
    expect(lerResumo().liquido).toBeCloseTo(300 / 1.06, 2);
  });
});
