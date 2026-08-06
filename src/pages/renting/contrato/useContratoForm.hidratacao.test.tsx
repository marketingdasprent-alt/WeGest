import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useContratoForm } from './useContratoForm';
import type { Reserva } from '@/types/reserva';

// ─────────────────────────────────────────────────────────────────────────────
// Encenação: a reserva servida pelo react-query.
//
// O bug real nasce de staleTime (30 s em useReserva) + invalidação: ao criar o
// contrato logo a seguir a guardar a reserva, o react-query entrega PRIMEIRO a
// cópia em cache (anterior à gravação) e só depois o refetch traz a versão
// fresca. Estes testes reproduzem essa sequência tal como ela acontece —
// primeiro render com o instantâneo velho, render seguinte com o fresco.
// ─────────────────────────────────────────────────────────────────────────────
let reservaDoServidor: Reserva | null = null;

// Identidade estável de propósito: o react-query (structural sharing) devolve a
// MESMA referência enquanto os dados não mudam. Um array novo a cada render
// faria a hidratação disparar sozinha e mascarava o que estamos a testar.
const CONDUTORES_DA_RESERVA: Array<{
  cliente_id: string | null;
  motorista_id: string | null;
  is_principal: boolean;
}> = [];

vi.mock('@/hooks/useReservas', () => ({
  useReserva: () => ({ data: reservaDoServidor, isLoading: false }),
}));

vi.mock('@/hooks/useReservaCondutores', () => ({
  useReservaCondutores: () => ({ data: CONDUTORES_DA_RESERVA }),
}));

// `useViaturas` devolve de propósito um array NOVO a cada chamada: é o que
// acontece no código real enquanto a query não resolve (`const { data: viaturas
// = [] }` cria um literal novo em cada render) e `viaturas` é dependência do
// efeito de hidratação. Assim, uma implementação que faça reset sempre que o
// efeito corre entra em ciclo e o React rebenta com "Maximum update depth
// exceeded" — o ciclo fica coberto por todos os testes deste ficheiro.
vi.mock('@/hooks/useViaturas', () => ({
  useViaturas: () => ({
    data: [{ id: 'v1', matricula: 'AA-00-BB', grupo_id: 'g1', modelo_id: null }],
  }),
}));

vi.mock('@/hooks/useClientes', () => ({ useClientes: () => ({ data: [] }) }));
vi.mock('@/hooks/useMotoristas', () => ({ useMotoristas: () => ({ data: [] }) }));
vi.mock('@/hooks/useClientesEmpresas', () => ({ useClientesEmpresas: () => ({ empresas: [] }) }));
vi.mock('@/hooks/useEstacoes', () => ({ useEstacoes: () => ({ data: [] }) }));
vi.mock('@/hooks/useRentingCoberturas', () => ({ useRentingCoberturas: () => ({ data: [] }) }));
vi.mock('@/hooks/useRentingExtras', () => ({ useRentingExtras: () => ({ data: [] }) }));
vi.mock('@/hooks/useRentingTaxas', () => ({ useRentingTaxas: () => ({ data: [] }) }));
vi.mock('@/hooks/useModelosElegiveisTvde', () => ({
  useModelosElegiveisTvde: () => ({ data: new Set<string>() }),
}));
vi.mock('@/hooks/useViaturasOcupadasPeriodo', () => ({
  useViaturasOcupadasPeriodo: () => ({ data: undefined }),
}));
vi.mock('@/hooks/useOrgDefinicoes', () => ({
  useOrgDefinicoes: () => ({ data: null }),
  ivaParaModalidade: () => 23,
}));
vi.mock('@/hooks/useRentingGruposTarifas', () => ({
  useRentingGruposMin: () => ({ data: [{ id: 'g1', nome: 'B' }] }),
  useRentingTarifasMin: () => ({ data: [] }),
  useRentingTarifaPrecosModelo: () => ({ data: [] }),
  calcularBaseAluguerRenting: () => 0,
  calcularFaturacaoRenting: () => null,
}));
vi.mock('@/hooks/useContratosRenting', () => ({
  useContratoRenting: () => ({ data: undefined, isLoading: false }),
  useContratoVizinhos: () => ({ data: undefined }),
  useContratoConflito: () => ({ data: false }),
  useCreateContratoRenting: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateContratoRenting: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteContratoRenting: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCriarVersaoContrato: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMarcarRealizacaoDireta: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useContratoCondutores', () => ({
  useContratoCondutores: () => ({ data: undefined }),
  useSyncContratoCondutores: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useContratoCoberturas', () => ({
  useContratoCoberturas: () => ({ data: undefined }),
  useSyncContratoCoberturas: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useContratoExtras', () => ({
  useContratoExtras: () => ({ data: undefined }),
  useSyncContratoExtras: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  calcExtraTotal: () => 0,
}));
vi.mock('@/hooks/useContratoTaxas', () => ({
  useContratoTaxas: () => ({ data: undefined }),
  useSyncContratoTaxas: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

function reserva(over: Partial<Reserva> = {}): Reserva {
  return {
    id: 'res-1',
    org_id: 'org-1',
    codigo: 42,
    viatura_id: 'v1',
    matricula: 'AA-00-BB',
    grupo: 'B',
    estacao_entrega_id: null,
    estacao_recolha_id: null,
    data_inicio: '2026-08-01T10:00:00.000Z',
    data_fim: '2026-08-16T10:00:00.000Z',
    cliente_id: '11111111-1111-1111-1111-111111111111',
    cliente_nome: 'Cliente Teste',
    condutor_id: null,
    condutor_nome: null,
    emissor_id: 'emissor-antigo',
    gestor_id: null,
    estado: 'confirmada',
    regime: 'rent_a_car',
    slot_valor_semanal: null,
    slot_valor_mensal: null,
    valor_total: 1350,
    tarifa_id: 'tarifa-antiga',
    observacoes: null,
    observacoes_internas: null,
    is_longa_duracao: false,
    renovacao_opcao: null,
    renovacao_intervalo_dias: null,
    franquia_valor: 500,
    caucao_valor: null,
    kms_incluidos: null,
    km_adicional_valor: null,
    deleted_at: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-01T10:00:00.000Z',
    ...over,
  };
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={['/renting/contratos/novo?reserva_id=res-1']}>
      {children}
    </MemoryRouter>
  </QueryClientProvider>
);

beforeEach(() => {
  reservaDoServidor = null;
});

describe('useContratoForm — contrato a partir de reserva com cache obsoleta', () => {
  it('segue o valor fresco quando o refetch entrega a reserva actualizada', () => {
    // Instantâneo em cache, anterior ao "Guardar" na reserva.
    reservaDoServidor = reserva({ valor_total: 1350 });
    const { result, rerender } = renderHook(() => useContratoForm(), { wrapper });

    expect(result.current.form.getValues('valor_total_manual')).toBe(1350);

    // O refetch em segundo plano chega com o que está mesmo gravado.
    reservaDoServidor = reserva({ valor_total: 1275 });
    rerender();

    expect(result.current.form.getValues('valor_total_manual')).toBe(1275);
    // E o cartão lateral (que lê o watch) tem de ver o mesmo.
    expect(result.current.valorTotalManual).toBe(1275);
  });

  it('acompanha também a tarifa e a empresa emissora', () => {
    reservaDoServidor = reserva({ tarifa_id: 'tarifa-antiga', emissor_id: 'emissor-antigo' });
    const { result, rerender } = renderHook(() => useContratoForm(), { wrapper });

    expect(result.current.form.getValues('tarifa_id')).toBe('tarifa-antiga');
    expect(result.current.form.getValues('emissor_id')).toBe('emissor-antigo');

    reservaDoServidor = reserva({ tarifa_id: 'tarifa-nova', emissor_id: 'emissor-novo' });
    rerender();

    expect(result.current.form.getValues('tarifa_id')).toBe('tarifa-nova');
    expect(result.current.form.getValues('emissor_id')).toBe('emissor-novo');
  });

  it('preserva o que o utilizador já editou quando chegam dados novos', () => {
    // É isto que a antiga guarda de "hidratar uma só vez" protegia: sem ela e
    // sem keepDirtyValues, um refetch limpava as edições em curso.
    reservaDoServidor = reserva({ valor_total: 1350, franquia_valor: 500 });
    const { result, rerender } = renderHook(() => useContratoForm(), { wrapper });

    act(() => {
      result.current.form.setValue('valor_total_manual', 999, { shouldDirty: true });
      result.current.form.setValue('observacoes', 'nota do utilizador', { shouldDirty: true });
    });

    reservaDoServidor = reserva({
      valor_total: 1275,
      franquia_valor: 750,
      observacoes: 'nota do servidor',
    });
    rerender();

    // Campos tocados pelo utilizador ficam.
    expect(result.current.form.getValues('valor_total_manual')).toBe(999);
    expect(result.current.form.getValues('observacoes')).toBe('nota do utilizador');
    // Campos que ele não tocou acompanham o servidor — senão isto seria só a
    // guarda antiga com outro nome.
    expect(result.current.form.getValues('franquia_valor')).toBe(750);
  });

  it('não volta a fazer reset quando os dados do servidor não mudam', () => {
    reservaDoServidor = reserva({ valor_total: 1350 });
    const { result, rerender } = renderHook(() => useContratoForm(), { wrapper });

    act(() => {
      result.current.form.setValue('valor_total_manual', 999, { shouldDirty: true });
    });

    // Re-render sem dados novos (a mesma referência de reserva, listas
    // auxiliares a mudar de identidade) não pode mexer no formulário.
    rerender();
    rerender();

    expect(result.current.form.getValues('valor_total_manual')).toBe(999);
  });
});
