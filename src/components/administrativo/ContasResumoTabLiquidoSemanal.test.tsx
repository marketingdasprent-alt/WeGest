// src/components/administrativo/ContasResumoTabLiquidoSemanal.test.tsx
//
// A lista de Contas é o único escritor de `motorista_liquido_semanal`, e o
// trigger dessa tabela transforma cada linha num movimento na conta corrente
// do motorista. Escrever de mais aqui não é um número errado num ecrã: é uma
// dívida que alguém vai cobrar a quem nada devia — foi o que aconteceu a
// 09/09 com a semana 07-13 ainda a decorrer.
//
// Estes testes fixam as duas metades da invariante: com o período fechado
// grava-se, com o período por fechar não se grava nada.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasAccessToResource: () => true, isAdmin: true }),
}));
vi.mock('@/contexts/TenantContext', () => ({ useOrgId: () => 'org-teste' }));
vi.mock('@/hooks/useThemedLogo', () => ({ useThemedLogo: () => '/Logo.png' }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

vi.mock('./contasResumoExports', () => ({
  gerarRelatoriosIndividuaisPDF: vi.fn(),
  gerarRelatorioConsolidadoPrint: vi.fn(),
  gerarPrintCompleto: vi.fn(),
  exportarExcel: vi.fn(),
}));

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

/** Guarda o que foi escrito em cada tabela, para além de responder às leituras. */
const escritas: Record<string, any[]> = {};

function criarBuilder(tabela: string, linhas: any[]) {
  const builder: any = new Proxy(
    {},
    {
      get(_alvo, prop) {
        if (prop === 'then') {
          return (resolve: (v: { data: any[]; error: null; count: number }) => void) =>
            resolve({ data: linhas, error: null, count: linhas.length });
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve({ data: linhas[0] ?? null, error: null });
        }
        if (prop === 'upsert' || prop === 'insert') {
          return (payload: any) => {
            escritas[tabela] = (escritas[tabela] ?? []).concat(payload);
            return builder;
          };
        }
        return () => builder;
      },
    }
  );
  return builder;
}

function mockarTabelas(tabelas: Record<string, any[]>) {
  (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((t: string) =>
    criarBuilder(t, tabelas[t] ?? [])
  );
}

const lerResumos = () => JSON.parse(screen.getByTestId('resumos').textContent || '[]');

const renderizar = () =>
  render(
    <MemoryRouter>
      <ContasResumoTab />
    </MemoryRouter>
  );

const motorista = { id: 'm1', nome: 'João Silva', recibo_verde: true };

const dadosBase = {
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
  bolt_resumos_semanais: [
    {
      motorista_id: 'm1',
      motorista_nome: 'João Silva',
      ganhos_liquidos: 300,
      gorjetas: 0,
      viagens_terminadas: 40,
      identificador_motorista: 'B1',
    },
  ],
};

describe('ContasResumoTab — gravação do líquido semanal', () => {
  beforeEach(() => {
    for (const k of Object.keys(escritas)) delete escritas[k];
    (supabase.auth.getUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'utilizador-1' } },
      error: null,
    });
    // O saldo pendente chega depois, por cima da tabela, e não tem que ver
    // com a gravação — basta não rebentar.
    (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  // Linhas em motorista_resumo_semanal são o sinal de que o período foi fechado.
  it('com o período fechado, grava o líquido de cada motorista', async () => {
    mockarTabelas({ motorista_resumo_semanal: [{ id: 'r1' }], ...dadosBase });
    renderizar();

    await waitFor(() => expect(lerResumos()).toHaveLength(1));
    await waitFor(() => expect(escritas['motorista_liquido_semanal']).toBeDefined());

    const [linha] = escritas['motorista_liquido_semanal'];
    expect(linha.motorista_id).toBe('m1');
    expect(linha.gravado_por).toBe('utilizador-1');
    expect(linha.liquido).toBe(lerResumos()[0].liquido);
  });

  // A metade que interessa: sem fecho, nada entra na conta corrente de ninguém.
  it('com o período por fechar, não grava nada', async () => {
    mockarTabelas({ motorista_resumo_semanal: [], ...dadosBase });
    renderizar();

    await waitFor(() => expect(screen.getByText('Período por fechar')).toBeTruthy());
    expect(escritas['motorista_liquido_semanal']).toBeUndefined();
  });
});
