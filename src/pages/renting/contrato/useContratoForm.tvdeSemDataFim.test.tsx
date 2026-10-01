import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useContratoForm } from './useContratoForm';
import type { Reserva } from '@/types/reserva';

// ─────────────────────────────────────────────────────────────────────────────
// Sentinela: um contrato TVDE nasce sem data de fim (migração
// 20260908115644), por isso o formulário hidrata `data_fim` a ''. O payload
// tem de o converter a null — e não pode chamar `localInputToIso('')`, que
// faz `new Date('').toISOString()` e atira RangeError. Quando isso acontece,
// o clique em "Abrir Contrato" morre dentro do handler: sem toast, sem
// pedido, sem contrato. Foi o que parou a criação de TVDE em 2026-09-08.
//
// A condição errada era `regime === 'tvde' && !is_longa_duracao`: como
// TODOS os contratos TVDE são de longa duração, nunca dava true.
// ─────────────────────────────────────────────────────────────────────────────

// Identidades estáveis de propósito: o react-query (structural sharing)
// devolve a MESMA referência enquanto os dados não mudam. Um array novo a
// cada render faz o efeito de hidratação disparar sozinho e o React entra
// em ciclo.
const { mutateCriar, VAZIO, VIATURAS, GRUPOS, MODELOS, NOOP, VIATURA_ID, toastSpy, CONDUTORES } =
  vi.hoisted(() => {
    const id = '3f8c1c22-1111-4111-8111-111111111111';
    return {
      mutateCriar: vi.fn(),
      VAZIO: [] as unknown[],
      VIATURAS: [{ id, matricula: 'AA-00-BB', grupo_id: 'g1', modelo_id: null }],
      GRUPOS: [{ id: 'g1', nome: 'B' }],
      MODELOS: new Set<string>(),
      NOOP: { mutate: () => {}, mutateAsync: async () => {}, isPending: false },
      VIATURA_ID: id,
      CONDUTORES: [
        {
          cliente_id: '3f8c1c22-2222-4222-8222-222222222222',
          motorista_id: null,
          is_principal: true,
        },
      ],
      toastSpy: vi.fn(),
    };
  });

const CLIENTE_ID = '3f8c1c22-2222-4222-8222-222222222222';
const RESERVA_ID = '3f8c1c22-3333-4333-8333-333333333333';
const EMISSOR_ID = '3f8c1c22-4444-4444-8444-444444444444';

let reservaDoServidor: Reserva | null = null;

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));
vi.mock('@/hooks/useReservas', () => ({
  useReserva: () => ({ data: reservaDoServidor, isLoading: false }),
}));
vi.mock('@/hooks/useReservaCondutores', () => ({
  useReservaCondutores: () => ({ data: CONDUTORES }),
}));
vi.mock('@/hooks/useReservaExtras', () => ({ useReservaExtras: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useViaturas', () => ({ useViaturas: () => ({ data: VIATURAS }) }));
vi.mock('@/hooks/useClientes', () => ({ useClientes: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useMotoristas', () => ({ useMotoristas: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useClientesEmpresas', () => ({
  useClientesEmpresas: () => ({ empresas: VAZIO }),
}));
vi.mock('@/hooks/useEstacoes', () => ({ useEstacoes: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useRentingCoberturas', () => ({ useRentingCoberturas: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useRentingExtras', () => ({ useRentingExtras: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useRentingTaxas', () => ({ useRentingTaxas: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useModelosElegiveisTvde', () => ({
  useModelosElegiveisTvde: () => ({ data: MODELOS }),
}));
vi.mock('@/hooks/useViaturasOcupadasPeriodo', () => ({
  useViaturasOcupadasPeriodo: () => ({ data: undefined }),
}));
vi.mock('@/hooks/useOrgDefinicoes', () => ({
  useOrgDefinicoes: () => ({ data: null }),
  ivaParaModalidade: () => 23,
}));
vi.mock('@/hooks/useRentingGruposTarifas', () => ({
  useRentingGruposMin: () => ({ data: GRUPOS }),
  useRentingTarifasMin: () => ({ data: VAZIO }),
  useRentingTarifaPrecosModelo: () => ({ data: VAZIO }),
  calcularBaseAluguerRenting: () => 0,
  calcularFaturacaoRenting: () => null,
}));
vi.mock('@/hooks/useContratosRenting', () => ({
  useContratoRenting: () => ({ data: undefined, isLoading: false }),
  useContratoVizinhos: () => ({ data: undefined }),
  useContratoConflito: () => ({ data: false }),
  useCreateContratoRenting: () => ({
    mutate: mutateCriar,
    mutateAsync: mutateCriar,
    isPending: false,
  }),
  useUpdateContratoRenting: () => NOOP,
  useDeleteContratoRenting: () => NOOP,
  useCancelarContratoRenting: () => NOOP,
  useCriarVersaoContrato: () => NOOP,
}));
vi.mock('@/hooks/useContratoCondutores', () => ({
  useContratoCondutores: () => ({ data: undefined }),
  useSyncContratoCondutores: () => NOOP,
}));
vi.mock('@/hooks/useContratoCoberturas', () => ({
  useContratoCoberturas: () => ({ data: undefined }),
  useSyncContratoCoberturas: () => NOOP,
}));
vi.mock('@/hooks/useContratoExtras', () => ({
  useContratoExtras: () => ({ data: undefined }),
  useSyncContratoExtras: () => NOOP,
  calcExtraTotal: () => 0,
}));
vi.mock('@/hooks/useContratoTaxas', () => ({
  useContratoTaxas: () => ({ data: undefined }),
  useSyncContratoTaxas: () => NOOP,
}));

/** Reserva igual à #929: TVDE, longa duração, renovação por intervalo. */
function reservaTvdeLongaDuracao(): Reserva {
  return {
    id: RESERVA_ID,
    org_id: 'org-1',
    codigo: 929,
    viatura_id: VIATURA_ID,
    matricula: 'AA-00-BB',
    grupo: 'B',
    estacao_entrega_id: null,
    estacao_recolha_id: null,
    data_inicio: '2026-09-09T13:00:00.000Z',
    data_fim: '2027-09-09T13:00:00.000Z',
    cliente_id: CLIENTE_ID,
    cliente_nome: 'Cliente Teste',
    condutor_id: null,
    condutor_nome: null,
    emissor_id: EMISSOR_ID,
    gestor_id: null,
    estado: 'pendente',
    regime: 'tvde',
    slot_valor_semanal: null,
    slot_valor_mensal: null,
    valor_total: 175,
    valor_total_manual: 175,
    tarifa_id: '3f8c1c22-5555-4555-8555-555555555555',
    observacoes: null,
    observacoes_internas: null,
    is_longa_duracao: true,
    renovacao_opcao: 'intervalo_dias',
    renovacao_intervalo_dias: 30,
    franquia_valor: null,
    caucao_valor: null,
    kms_incluidos: null,
    km_adicional_valor: null,
    deleted_at: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-09-09T09:03:33.000Z',
    updated_at: '2026-09-09T09:03:33.000Z',
  } as unknown as Reserva;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={[`/renting/contratos/novo?reserva_id=${RESERVA_ID}`]}>
      {children}
    </MemoryRouter>
  </QueryClientProvider>
);

beforeEach(() => {
  reservaDoServidor = null;
  mutateCriar.mockClear();
});

describe('"Abrir Contrato" — reserva TVDE de longa duração', () => {
  it('cria o contrato em vez de morrer com data de fim vazia', async () => {
    reservaDoServidor = reservaTvdeLongaDuracao();
    const { result } = renderHook(() => useContratoForm(), { wrapper });

    // Hidratação: TVDE nasce sem data de fim.
    expect(result.current.form.getValues('regime')).toBe('tvde');
    expect(result.current.form.getValues('is_longa_duracao')).toBe(true);
    expect(result.current.form.getValues('data_fim')).toBeFalsy();

    await (result.current.handleSubmit as unknown as () => Promise<void>)();

    // O clique tem de chegar à mutation, com a data de fim a null.
    expect(mutateCriar).toHaveBeenCalledTimes(1);
    expect(mutateCriar.mock.calls[0][0]).toMatchObject({ regime: 'tvde', data_fim: null });
  });
});
