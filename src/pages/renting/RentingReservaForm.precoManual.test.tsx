import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { UseFormReturn } from 'react-hook-form';

import RentingReservaForm from './RentingReservaForm';
import type { ReservaFormValues } from '@/components/renting/reservas/reservaDialog.schema';
import type { Reserva } from '@/types/reserva';

// ─────────────────────────────────────────────────────────────────────────────
// O preço escrito à mão no card de Preço (barra lateral direita) vai para
// `valor_total_manual`. O que o resto da aplicação lê — o contrato ao ser
// criado a partir da reserva, a faturação — é `valor_total`, documentado como
// "o valor EFECTIVO: o manual quando existe, senão o da tarifa". Este teste
// prende essa invariante no momento em que ela é decidida: o payload gravado.
// ─────────────────────────────────────────────────────────────────────────────

const { guardado } = vi.hoisted(() => ({
  guardado: { payload: null as Record<string, unknown> | null, via: '' },
}));

let reservaDoServidor: Reserva | null = null;
const VAZIO: never[] = [];

vi.mock('@/hooks/useReservas', () => ({
  useReserva: () => ({ data: reservaDoServidor, isLoading: false }),
  useCreateReserva: () => ({
    mutate: (vars: Record<string, unknown>) => {
      guardado.via = 'create';
      guardado.payload = vars;
    },
    isPending: false,
  }),
  useUpdateReserva: () => ({
    mutate: (vars: Record<string, unknown>) => {
      guardado.via = 'update';
      guardado.payload = vars;
    },
    isPending: false,
  }),
  useDeleteReserva: () => ({ mutate: vi.fn(), isPending: false }),
  useReservaConflito: () => ({ data: false }),
}));

const CONDUTORES = [
  { cliente_id: '11111111-1111-1111-1111-111111111111', motorista_id: null, is_principal: true },
];
vi.mock('@/hooks/useReservaCondutores', () => ({
  useReservaCondutores: () => ({ data: CONDUTORES }),
  useSyncReservaCondutores: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useReservaCoberturas', () => ({
  useReservaCoberturas: () => ({ data: VAZIO }),
  useSyncReservaCoberturas: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useReservaExtras', () => ({
  useReservaExtras: () => ({ data: VAZIO }),
  useSyncReservaExtras: () => ({ mutateAsync: vi.fn(), isPending: false }),
  calcExtraTotal: () => 0,
}));
vi.mock('@/hooks/useReservaTaxas', () => ({
  useReservaTaxas: () => ({ data: VAZIO }),
  useSyncReservaTaxas: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useContratosRenting', () => ({
  useContratoIdByReserva: () => ({ data: null }),
}));
vi.mock('@/hooks/useReservaAnexos', () => ({ uploadReservaAnexoSync: vi.fn() }));
vi.mock('@/hooks/useClientes', () => ({ useClientes: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useMotoristas', () => ({ useMotoristas: () => ({ data: VAZIO }) }));
const ESTACOES = [
  { id: '44444444-4444-4444-4444-444444444444', nome: 'Leiria', cidade: 'Leiria', ativa: true },
];
vi.mock('@/hooks/useEstacoes', () => ({ useEstacoes: () => ({ data: ESTACOES }) }));
vi.mock('@/hooks/useRentingCoberturas', () => ({ useRentingCoberturas: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useRentingExtras', () => ({ useRentingExtras: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useRentingTaxas', () => ({ useRentingTaxas: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useViaturas', () => ({
  useViaturas: () => ({
    data: [
      {
        id: '22222222-2222-2222-2222-222222222222',
        matricula: 'AA-00-BB',
        grupo_id: '55555555-5555-5555-5555-555555555555',
      },
    ],
  }),
}));
vi.mock('@/hooks/useViaturasOcupadasPeriodo', () => ({
  useViaturasOcupadasPeriodo: () => ({ data: undefined }),
}));

// `calcularBaseAluguerRenting` fica com a implementação REAL — é a regra de
// precedência (override manual vence a tarifa) que está em causa aqui.
vi.mock('@/hooks/useRentingGruposTarifas', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/useRentingGruposTarifas')>();
  return {
    ...real,
    useRentingGruposMin: () => ({
      data: [{ id: '55555555-5555-5555-5555-555555555555', nome: 'B' }],
    }),
    useRentingTarifaPrecosModelo: () => ({ data: VAZIO }),
  };
});

vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canEdit: () => true }) }));
vi.mock('@/hooks/useGoBack', () => ({ useGoBack: () => vi.fn() }));

let formDaPagina: UseFormReturn<ReservaFormValues> | null = null;

vi.mock('@/components/renting/reservas/ReservaResumoSidebar', () => ({
  ReservaResumoSidebar: ({ form }: { form: UseFormReturn<ReservaFormValues> }) => {
    formDaPagina = form;
    return <div data-testid="valores-form">{JSON.stringify(form.watch())}</div>;
  },
}));
vi.mock('@/components/renting/reservas/ReservaTabsPlaceholder', () => ({
  ReservaTabsPlaceholder: () => null,
}));
vi.mock('@/components/renting/ClienteDialog', () => ({ ClienteDialog: () => null }));
vi.mock('@/components/motoristas/MotoristaDialog', () => ({ MotoristaDialog: () => null }));
vi.mock('@/components/motoristas/CondutorProvisiorioDialog', () => ({
  CondutorProvisiorioDialog: () => null,
}));
vi.mock('@/components/motoristas/GenerateDocumentsDialog', () => ({
  GenerateDocumentsDialog: () => null,
}));
vi.mock('@/components/renting/reservas/ReservaDeleteConfirm', () => ({
  ReservaDeleteConfirm: () => null,
}));

function reserva(over: Partial<Reserva> = {}): Reserva {
  return {
    id: 'res-1',
    org_id: 'org-1',
    codigo: 42,
    viatura_id: '22222222-2222-2222-2222-222222222222',
    matricula: 'AA-00-BB',
    grupo: 'B',
    estacao_entrega_id: '44444444-4444-4444-4444-444444444444',
    estacao_recolha_id: '44444444-4444-4444-4444-444444444444',
    data_inicio: '2026-08-01T10:00:00.000Z',
    data_fim: '2026-08-16T10:00:00.000Z',
    cliente_id: '11111111-1111-1111-1111-111111111111',
    cliente_nome: 'Cliente Teste',
    condutor_id: null,
    condutor_nome: null,
    emissor_id: '33333333-3333-3333-3333-333333333333',
    gestor_id: null,
    estado: 'confirmada',
    regime: 'rent_a_car',
    slot_valor_semanal: null,
    slot_valor_mensal: null,
    valor_total: 1350,
    valor_total_manual: null,
    tarifa_id: null,
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

function Pagina() {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/renting/reservas/res-1']}>
        <Routes>
          <Route path="/renting/reservas/:id" element={<RentingReservaForm />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  reservaDoServidor = null;
  formDaPagina = null;
  guardado.payload = null;
  guardado.via = '';
});

describe('RentingReservaForm — preço escrito à mão', () => {
  it('grava o preço manual em valor_total, que é o campo que o contrato lê', async () => {
    reservaDoServidor = reserva({ valor_total: 1350, valor_total_manual: null });
    render(<Pagina />);

    // O card de Preço da barra lateral escreve exclusivamente neste campo.
    act(() => {
      formDaPagina?.setValue('valor_total_manual', 900, { shouldDirty: true });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(guardado.payload).not.toBeNull();
    });

    // O override tem de viajar (isto já funcionava)...
    expect(guardado.payload?.valor_total_manual).toBe(900);
    // ...mas é `valor_total` que o contrato hidrata. Enquanto ficar com o valor
    // antigo, converter a reserva em contrato traz o preço errado.
    expect(guardado.payload?.valor_total).toBe(900);
  });

  it('sem preço manual, valor_total segue a tarifa e não é sobrescrito', async () => {
    reservaDoServidor = reserva({ valor_total: 1350, valor_total_manual: null });
    render(<Pagina />);

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(guardado.payload).not.toBeNull();
    });

    expect(guardado.payload?.valor_total_manual).toBeNull();
    expect(guardado.payload?.valor_total).toBe(1350);
  });
});
