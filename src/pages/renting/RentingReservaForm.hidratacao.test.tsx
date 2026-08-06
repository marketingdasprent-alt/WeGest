import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { UseFormReturn } from 'react-hook-form';

import RentingReservaForm from './RentingReservaForm';
import type { ReservaFormValues } from '@/components/renting/reservas/reservaDialog.schema';
import type { Reserva } from '@/types/reserva';

// ─────────────────────────────────────────────────────────────────────────────
// Encenação: sair da reserva e voltar a entrar. `useReserva` tem staleTime de
// 30 s, por isso o react-query serve PRIMEIRO a cópia em cache (anterior ao
// último "Guardar") e só depois entrega o resultado do refetch. Os testes
// reproduzem essa ordem: primeiro render com o instantâneo velho, render
// seguinte com o fresco.
// ─────────────────────────────────────────────────────────────────────────────
let reservaDoServidor: Reserva | null = null;

// Listas de relações com identidade estável (é o que o react-query devolve
// enquanto os dados não mudam); um array novo a cada render punha os efeitos
// das relações a fazer reset sozinhos.
const VAZIO: never[] = [];

vi.mock('@/hooks/useReservas', () => ({
  useReserva: () => ({ data: reservaDoServidor, isLoading: false }),
  useCreateReserva: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateReserva: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteReserva: () => ({ mutate: vi.fn(), isPending: false }),
  useReservaConflito: () => ({ data: false }),
}));

vi.mock('@/hooks/useReservaCondutores', () => ({
  useReservaCondutores: () => ({ data: VAZIO }),
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
vi.mock('@/hooks/useEstacoes', () => ({ useEstacoes: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useRentingCoberturas', () => ({ useRentingCoberturas: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useRentingExtras', () => ({ useRentingExtras: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useRentingTaxas', () => ({ useRentingTaxas: () => ({ data: VAZIO }) }));
vi.mock('@/hooks/useViaturas', () => ({
  useViaturas: () => ({ data: [{ id: 'v1', matricula: 'AA-00-BB', grupo_id: 'g1' }] }),
}));
vi.mock('@/hooks/useViaturasOcupadasPeriodo', () => ({
  useViaturasOcupadasPeriodo: () => ({ data: undefined }),
}));
vi.mock('@/hooks/useRentingGruposTarifas', () => ({
  useRentingGruposMin: () => ({ data: [{ id: 'g1', nome: 'B' }] }),
  useRentingTarifaPrecosModelo: () => ({ data: VAZIO }),
  calcularBaseAluguerRenting: () => null,
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canEdit: () => true }) }));
vi.mock('@/hooks/useGoBack', () => ({ useGoBack: () => vi.fn() }));

// Filhos apenas de apresentação — fora do âmbito deste teste, que é a
// hidratação feita no formulário-pai. A barra lateral serve de sonda: recebe o
// mesmo `form`, escreve os valores actuais para o teste os poder ler e deixa-o
// à mão para simular o utilizador a escrever num campo.
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
    valor_total_manual: null,
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

function valores(): ReservaFormValues {
  return JSON.parse(screen.getByTestId('valores-form').textContent ?? '{}');
}

beforeEach(() => {
  reservaDoServidor = null;
  formDaPagina = null;
});

describe('RentingReservaForm — reserva reaberta com cache obsoleta', () => {
  it('segue o valor fresco quando o refetch entrega a reserva actualizada', () => {
    reservaDoServidor = reserva({ valor_total: 1350 });
    const { rerender } = render(<Pagina />);

    expect(valores().valor_total).toBe(1350);

    reservaDoServidor = reserva({ valor_total: 1275 });
    rerender(<Pagina />);

    expect(valores().valor_total).toBe(1275);
  });

  it('acompanha também a tarifa e a empresa emissora', () => {
    reservaDoServidor = reserva({ tarifa_id: 'tarifa-antiga', emissor_id: 'emissor-antigo' });
    const { rerender } = render(<Pagina />);

    expect(valores().tarifa_id).toBe('tarifa-antiga');
    expect(valores().emissor_id).toBe('emissor-antigo');

    reservaDoServidor = reserva({ tarifa_id: 'tarifa-nova', emissor_id: 'emissor-novo' });
    rerender(<Pagina />);

    expect(valores().tarifa_id).toBe('tarifa-nova');
    expect(valores().emissor_id).toBe('emissor-novo');
  });

  it('preserva o que o utilizador já editou quando chegam dados novos', () => {
    // A guarda de "hidratar uma só vez" existia para um refetch não apagar
    // edições em curso. keepDirtyValues garante o mesmo, campo a campo.
    reservaDoServidor = reserva({ valor_total: 1350, franquia_valor: 500 });
    const { rerender } = render(<Pagina />);

    act(() => {
      formDaPagina?.setValue('valor_total', 999, { shouldDirty: true });
    });

    reservaDoServidor = reserva({ valor_total: 1275, franquia_valor: 750 });
    rerender(<Pagina />);

    expect(valores().valor_total).toBe(999);
    // O campo que ele não tocou acompanha o servidor.
    expect(valores().franquia_valor).toBe(750);
  });
});
