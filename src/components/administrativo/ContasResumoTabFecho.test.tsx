// src/components/administrativo/ContasResumoTabFecho.test.tsx
// O resumo só aparece depois de "Fechar Período".
//
// Duas regressões vivem aqui:
//
//  1. O sinal de "fechada" é SOBREPOSIÇÃO de intervalos, não igualdade. O botão
//     deixa escolher um intervalo qualquer no calendário e a função grava-o tal
//     e qual — em produção há fechos de 8 dias a começar num domingo, de 3 dias
//     e de 1 dia. Comparar com a segunda-feira da semana vista trancava para
//     sempre semanas que já tinham sido fechadas.
//
//  2. weekStart/weekEnd são Date novos a cada render. Nas dependências de um
//     efeito que muda estado davam um ciclo infinito — o ecrã piscava sem
//     parar. O teste conta as consultas para o apanhar.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasAccessToResource: () => true, isAdmin: true }),
}));
vi.mock('@/hooks/useThemedLogo', () => ({ useThemedLogo: () => '/Logo.png' }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

vi.mock('./contasResumoExports', () => ({
  gerarRelatoriosIndividuaisPDF: vi.fn(),
  gerarRelatorioConsolidadoPrint: vi.fn(),
  gerarPrintCompleto: vi.fn(),
  exportarExcel: vi.fn(),
}));

vi.mock('./ContasResumoTabela', () => ({
  ContasResumoTabela: () => <div data-testid="tabela" />,
}));
vi.mock('./ContasResumoFiltros', () => ({ ContasResumoFiltros: () => null }));
vi.mock('./ContasResumoStats', () => ({ ContasResumoStats: () => null }));
vi.mock('./ContasResumoBulkBar', () => ({ ContasResumoBulkBar: () => null }));
vi.mock('./MotoristaResumoDialog', () => ({ MotoristaResumoDialog: () => null }));
vi.mock('./ImportarDadosWizard', () => ({ ImportarDadosWizard: () => null }));
vi.mock('./RelatorioPagamentoDialog', () => ({ RelatorioPagamentoDialog: () => null }));

import { ContasResumoTab } from './ContasResumoTab';

/**
 * Query builder falso. Guarda os filtros aplicados para o teste poder afirmar
 * que a pergunta feita à BD é a de sobreposição, e não a de igualdade.
 */
function criarBuilder(linhas: any[], registo: { filtros: string[] }) {
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
        return (...args: any[]) => {
          if (prop === 'lte' || prop === 'gte' || prop === 'eq') {
            registo.filtros.push(`${String(prop)}:${args[0]}`);
          }
          return builder;
        };
      },
    }
  );
  return builder;
}

const mockFrom = () => supabase.from as unknown as ReturnType<typeof vi.fn>;

let filtrosDoFecho: { filtros: string[] };

function montarBD(linhasDoFecho: any[]) {
  filtrosDoFecho = { filtros: [] };
  mockFrom().mockImplementation((t: string) =>
    t === 'motorista_resumo_semanal'
      ? criarBuilder(linhasDoFecho, filtrosDoFecho)
      : criarBuilder([], { filtros: [] })
  );
}

const vezesQueVerificouOFecho = () =>
  mockFrom().mock.calls.filter((c: any[]) => c[0] === 'motorista_resumo_semanal').length;

const renderizar = () =>
  render(
    <MemoryRouter>
      <ContasResumoTab />
    </MemoryRouter>
  );

describe('ContasResumoTab — portão do Fechar Período', () => {
  beforeEach(() => {
    mockFrom().mockReset();
  });

  it('sem período fechado não mostra a tabela — mostra o cadeado', async () => {
    montarBD([]);
    renderizar();
    await screen.findByText('Período por fechar');
    expect(screen.queryByTestId('tabela')).toBeNull();
  });

  it('com um período fechado que cobre a semana, mostra a tabela', async () => {
    montarBD([{ id: 'r1' }]);
    renderizar();
    await screen.findByTestId('tabela');
    expect(screen.queryByText('Período por fechar')).toBeNull();
  });

  it('pergunta por sobreposição de intervalos, não por igualdade de data', async () => {
    montarBD([]);
    renderizar();
    await screen.findByText('Período por fechar');
    // lte(semana_inicio, fim) + gte(semana_fim, inicio) — um fecho de 02/08 a
    // 09/08 tem de destrancar a semana de 03/08 a 09/08.
    expect(filtrosDoFecho.filtros.some((f) => f.startsWith('lte:'))).toBe(true);
    expect(filtrosDoFecho.filtros.some((f) => f.startsWith('gte:'))).toBe(true);
    expect(filtrosDoFecho.filtros.some((f) => f.startsWith('eq:'))).toBe(false);
  });

  it('não entra em ciclo de renders (o ecrã piscava sem parar)', async () => {
    montarBD([]);
    renderizar();
    await screen.findByText('Período por fechar');

    // Deixa o React assentar. Com o bug, weekStart/weekEnd eram Date novos a
    // cada render e a contagem disparava para as centenas.
    const depoisDeAssentar = await new Promise<number>((resolve) => {
      setTimeout(() => resolve(vezesQueVerificouOFecho()), 150);
    });

    expect(depoisDeAssentar).toBeLessThanOrEqual(3);

    // E continua parado: mais nenhuma consulta depois de estabilizar.
    await new Promise((r) => setTimeout(r, 100));
    await waitFor(() => expect(vezesQueVerificouOFecho()).toBe(depoisDeAssentar));
  });
});
