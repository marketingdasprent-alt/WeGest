// src/components/administrativo/ContasResumoTabBolt.test.tsx
// Regressão: os acertos davam precedência silenciosa à API (bolt_viagens)
// sobre o CSV (bolt_resumos_semanais) — o dinheiro do CSV desaparecia assim
// que a API tivesse a primeira linha.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasAccessToResource: () => true, isAdmin: true }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useOrgId: () => 'org-teste',
}));
vi.mock('@/hooks/useThemedLogo', () => ({ useThemedLogo: () => '/Logo.png' }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

// xlsx + jsPDF não têm nada que ver com o cálculo — fora do teste.
vi.mock('./contasResumoExports', () => ({
  gerarRelatoriosIndividuaisPDF: vi.fn(),
  gerarRelatorioConsolidadoPrint: vi.fn(),
  gerarPrintCompleto: vi.fn(),
  exportarExcel: vi.fn(),
}));

// A tabela é onde os resumos calculados saem do componente — stub para os ler
// em bruto, sem depender da formatação em euros nem do DOM da tabela.
vi.mock('./ContasResumoTabela', () => ({
  ContasResumoTabela: ({ filteredResumos }: any) => (
    <div data-testid="resumos">{JSON.stringify(filteredResumos)}</div>
  ),
}));
vi.mock('./ContasResumoFiltros', () => ({ ContasResumoFiltros: () => null }));
vi.mock('./ContasResumoStats', () => ({ ContasResumoStats: () => null }));
vi.mock('./ContasResumoBulkBar', () => ({ ContasResumoBulkBar: () => null }));
vi.mock('./MotoristaResumoDialog', () => ({ MotoristaResumoDialog: () => null }));
vi.mock('./ImportarDadosWizard', () => ({ ImportarDadosWizard: () => null }));
vi.mock('./RelatorioPagamentoDialog', () => ({ RelatorioPagamentoDialog: () => null }));

import { ContasResumoTab } from './ContasResumoTab';

/** Query builder falso: encadeia tudo e resolve com as linhas da tabela. */
function criarBuilder(linhas: any[]) {
  const builder: any = new Proxy(
    {},
    {
      get(_alvo, prop) {
        if (prop === 'then') {
          // `count` para as consultas com { count: 'exact', head: true } — é
          // assim que o componente verifica se o período já foi fechado.
          return (resolve: (v: { data: any[]; error: null; count: number }) => void) =>
            resolve({ data: linhas, error: null, count: linhas.length });
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
  // O ecrã só calcula depois de o período estar fechado, e o sinal de fechado é
  // haver linhas em motorista_resumo_semanal. Estes testes são sobre a conta da
  // receita Bolt, não sobre o portão — por isso o período nasce fechado.
  const comPeriodoFechado = { motorista_resumo_semanal: [{ id: 'r1' }], ...tabelas };
  (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((t: string) =>
    criarBuilder(comPeriodoFechado[t as keyof typeof comPeriodoFechado] ?? [])
  );
}

const tabelasConsultadas = () =>
  (supabase.from as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);

const lerResumos = () => JSON.parse(screen.getByTestId('resumos').textContent || '[]');

// usePagination usa useLocation — o componente precisa de um Router.
const renderizar = () =>
  render(
    <MemoryRouter>
      <ContasResumoTab />
    </MemoryRouter>
  );

function dadosDoMotorista(reciboVerde: boolean) {
  const motorista = { id: 'm1', nome: 'João Silva', recibo_verde: reciboVerde };
  return {
    bolt_drivers: [
      { driver_uuid: 'u1', motorista_id: 'm1', name: 'João Silva', motoristas_ativos: motorista },
    ],
    motoristas_ativos: [
      {
        ...motorista,
        uber_uuid: null,
        bolt_id: 'B1',
        gestor_responsavel: null,
        data_contratacao: '2024-01-01',
        status_ativo: true,
        created_at: '2024-01-01',
      },
    ],
    // A API tem 500 € para a mesma semana. Com a fonte em 'csv' não pode
    // substituir nem somar-se aos 300 € do relatório semanal.
    bolt_viagens: [{ driver_name: 'João Silva', driver_uuid: 'u1', driver_earnings: 500 }],
    bolt_resumos_semanais: [
      {
        motorista_id: 'm1',
        motorista_nome: 'João Silva',
        ganhos_liquidos: 300,
        gorjetas: 25,
        viagens_terminadas: 40,
        identificador_motorista: 'B1',
      },
    ],
  };
}

describe('ContasResumoTab — receita Bolt', () => {
  beforeEach(() => {
    mockarTabelas(dadosDoMotorista(true));
  });

  it('não substitui o CSV pela API: os ganhos do relatório semanal mantêm-se', async () => {
    renderizar();
    await waitFor(() => expect(lerResumos()).toHaveLength(1));
    const [resumo] = lerResumos();
    expect(resumo.faturado_bolt).toBe(300); // 0 = CSV descartado; 800 = duplicado
    expect(resumo.viagens_bolt).toBe(40);
    expect(resumo.total_faturado).toBe(300);
  });

  it('não consulta bolt_viagens enquanto a fonte financeira for o CSV (modo sombra)', async () => {
    renderizar();
    await waitFor(() => expect(lerResumos()).toHaveLength(1));
    expect(tabelasConsultadas()).toContain('bolt_resumos_semanais');
    expect(tabelasConsultadas()).not.toContain('bolt_viagens');
  });

  it('mantém a gorjeta do CSV fora da divisão por 1,06 do recibo verde', async () => {
    mockarTabelas(dadosDoMotorista(false));
    renderizar();
    await waitFor(() => expect(lerResumos()).toHaveLength(1));
    const [resumo] = lerResumos();
    expect(resumo.gorjeta_bolt).toBe(25);
    // (300 − 25) / 1,06 + 25 — se a gorjeta entrasse na divisão daria 283,02 €.
    expect(resumo.liquido).toBeCloseTo((300 - 25) / 1.06 + 25, 2);
  });
});
