import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useContratoForm } from './useContratoForm';
import type { Reserva } from '@/types/reserva';

// Abertura de contrato TVDE: o valor combinado com o motorista não vai para
// valor_total_manual (o fecho semanal ignora-o, caso #1026); se difere da
// tarifa, vira um pedido 'preco_semana' ao Supervisor Gestor TVDE.

// Identidades estáveis de propósito (ver useContratoForm.tvdeSemDataFim.test).
const {
  mutateCriar,
  mutatePedido,
  mutarAtualizar,
  navegarSpy,
  toastSpy,
  VAZIO,
  VIATURAS,
  GRUPOS,
  MODELOS,
  NOOP,
  CONDUTORES,
  TARIFAS,
  PRECOS,
  VIATURA_ID,
  TARIFA_ID,
  LINHA_PRECO,
} = vi.hoisted(() => {
  const viaturaId = '3f8c1c22-1111-4111-8111-111111111111';
  const tarifaId = '3f8c1c22-5555-4555-8555-555555555555';
  const linha = {
    tarifa_id: tarifaId,
    modelo_id: 'm1',
    preco_semana: 200,
    preco_dia: 30,
    preco_mes: null,
    km_mensal: null,
    km_adicional_valor: null,
    franquia_valor: null,
    caucao_valor: null,
  };
  return {
    mutateCriar: vi.fn(),
    mutatePedido: vi.fn(),
    mutarAtualizar: vi.fn(),
    navegarSpy: vi.fn(),
    toastSpy: vi.fn(),
    VAZIO: [] as unknown[],
    VIATURAS: [
      { id: viaturaId, matricula: 'AA-00-BB', grupo_id: 'g1', modelo_id: 'm1' },
      // Viatura antiga sem modelo: a guarda "sem preço" recusava-a na edição.
      {
        id: '3f8c1c22-9999-4999-8999-999999999999',
        matricula: 'CC-11-DD',
        grupo_id: 'g1',
        modelo_id: null,
      },
    ],
    GRUPOS: [{ id: 'g1', nome: 'B' }],
    MODELOS: new Set<string>(['m1']),
    NOOP: { mutate: () => {}, mutateAsync: async () => {}, isPending: false },
    CONDUTORES: [
      {
        cliente_id: '3f8c1c22-2222-4222-8222-222222222222',
        motorista_id: null,
        is_principal: true,
      },
    ],
    TARIFAS: [
      {
        id: tarifaId,
        nome: 'TVDE - Base',
        tipo: 'tvde',
        grupo_id: null,
        preco_dia: null,
        preco_semana: null,
        preco_mes: null,
      },
    ],
    PRECOS: [linha],
    VIATURA_ID: viaturaId,
    TARIFA_ID: tarifaId,
    LINHA_PRECO: linha,
  };
});

const CLIENTE_ID = '3f8c1c22-2222-4222-8222-222222222222';
const RESERVA_ID = '3f8c1c22-3333-4333-8333-333333333333';
const EMISSOR_ID = '3f8c1c22-4444-4444-8444-444444444444';

let reservaDoServidor: Reserva | null = null;
let contratoDoServidor: unknown;

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
vi.mock('@/hooks/useRentingGruposTarifas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useRentingGruposTarifas')>()),
  useRentingGruposMin: () => ({ data: GRUPOS }),
  useRentingTarifasMin: () => ({ data: TARIFAS }),
  useRentingTarifaPrecosModelo: () => ({ data: PRECOS }),
}));
vi.mock('@/hooks/usePedidosTrocaKms', () => ({
  useCriarPedidoTrocaKms: () => ({ mutateAsync: mutatePedido, mutate: mutatePedido }),
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navegarSpy,
}));
vi.mock('@/hooks/useContratosRenting', () => ({
  useContratoRenting: () => ({ data: contratoDoServidor, isLoading: false }),
  useContratoVizinhos: () => ({ data: undefined }),
  useContratoConflito: () => ({ data: false }),
  // Simula o servidor: devolve o contrato criado e dispara o onSuccess.
  useCreateContratoRenting: () => ({
    mutate: (payload: unknown, opts?: { onSuccess?: (c: { id: string }) => unknown }) => {
      mutateCriar(payload);
      return opts?.onSuccess?.({ id: 'contrato-novo' });
    },
    isPending: false,
  }),
  useUpdateContratoRenting: () => ({ mutate: mutarAtualizar, isPending: false }),
  useDeleteContratoRenting: () => NOOP,
  useCancelarContratoRenting: () => NOOP,
  useCriarVersaoContrato: () => NOOP,
}));
vi.mock('@/hooks/useContratoCondutores', () => ({
  useContratoCondutores: () => ({ data: contratoDoServidor ? CONDUTORES : undefined }),
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

function reservaBase(regime: 'tvde' | 'rent_a_car'): Reserva {
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
    data_fim: '2026-09-20T13:00:00.000Z',
    cliente_id: CLIENTE_ID,
    cliente_nome: 'Cliente Teste',
    condutor_id: null,
    condutor_nome: null,
    emissor_id: EMISSOR_ID,
    gestor_id: null,
    estado: 'pendente',
    regime,
    slot_valor_semanal: null,
    slot_valor_mensal: null,
    valor_total: 175,
    valor_total_manual: 175,
    tarifa_id: TARIFA_ID,
    observacoes: null,
    observacoes_internas: null,
    is_longa_duracao: regime === 'tvde',
    renovacao_opcao: null,
    renovacao_intervalo_dias: null,
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
    <MemoryRouter
      initialEntries={[
        contratoDoServidor
          ? '/renting/contratos/contrato-1'
          : `/renting/contratos/novo?reserva_id=${RESERVA_ID}`,
      ]}
    >
      <Routes>
        <Route path="/renting/contratos/novo" element={children} />
        <Route path="/renting/contratos/:id" element={children} />
        <Route path="*" element={children} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
);

async function abrirContrato(
  regime: 'tvde' | 'rent_a_car',
  valores: Record<string, unknown> = {}
): Promise<void> {
  reservaDoServidor = reservaBase(regime);
  const { result } = renderHook(() => useContratoForm(), { wrapper });
  act(() => {
    Object.entries(valores).forEach(([campo, valor]) =>
      result.current.form.setValue(campo as 'regime', valor as never)
    );
  });
  await act(async () => {
    await (result.current.handleSubmit as unknown as () => Promise<void>)();
  });
}

beforeEach(() => {
  reservaDoServidor = null;
  contratoDoServidor = undefined;
  mutarAtualizar.mockClear();
  mutateCriar.mockClear();
  mutatePedido.mockReset();
  mutatePedido.mockResolvedValue(undefined);
  navegarSpy.mockClear();
  toastSpy.mockClear();
});

describe('abrir contrato TVDE: valor acordado com o motorista', () => {
  it('cria o pedido quando o valor pretendido difere da tarifa', async () => {
    await abrirContrato('tvde', {
      preco_semana_pretendido: 180,
      motivo_preco_semana: 'Motorista da casa',
    });

    expect(mutateCriar).toHaveBeenCalledTimes(1);
    expect(mutatePedido).toHaveBeenCalledWith({
      contratoId: 'contrato-novo',
      tipo: 'preco_semana',
      valorAtual: 200,
      valorPedido: 180,
      motivo: 'Valor acordado na abertura do contrato: Motorista da casa',
    });
    expect(navegarSpy).toHaveBeenCalledWith('/renting/contratos/contrato-novo?criado=1');
  });

  it('sem motivo, usa só o motivo base', async () => {
    await abrirContrato('tvde', { preco_semana_pretendido: 180 });
    expect(mutatePedido.mock.calls[0][0].motivo).toBe('Valor acordado na abertura do contrato');
  });

  it('não cria pedido quando é igual à tarifa', async () => {
    await abrirContrato('tvde', { preco_semana_pretendido: 200 });
    expect(mutateCriar).toHaveBeenCalledTimes(1);
    expect(mutatePedido).not.toHaveBeenCalled();
    expect(navegarSpy).toHaveBeenCalled();
  });

  it('não cria pedido quando está vazio', async () => {
    await abrirContrato('tvde', {});
    expect(mutateCriar).toHaveBeenCalledTimes(1);
    expect(mutatePedido).not.toHaveBeenCalled();
  });

  it('se o pedido falha, avisa e abre o contrato na mesma', async () => {
    mutatePedido.mockRejectedValue(new Error('rede em baixo'));
    await abrirContrato('tvde', { preco_semana_pretendido: 180 });

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Contrato aberto.',
        description: 'Pede o valor acordado no cartão do contrato.',
      })
    );
    // O erro destrutivo é do hook do pedido; aqui não se duplica.
    expect(toastSpy).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(navegarSpy).toHaveBeenCalledWith('/renting/contratos/contrato-novo?criado=1');
  });

  it('arredonda o valor pedido aos cêntimos', async () => {
    await abrirContrato('tvde', { preco_semana_pretendido: 225.006 });
    expect(mutatePedido.mock.calls[0][0].valorPedido).toBe(225.01);
  });

  it('tarifa a 0 €: não cria pedido e avisa sem erro destrutivo', async () => {
    PRECOS[0] = { ...LINHA_PRECO, preco_semana: 0 };
    try {
      await abrirContrato('tvde', { preco_semana_pretendido: 180 });
    } finally {
      PRECOS[0] = LINHA_PRECO;
    }
    expect(mutateCriar).toHaveBeenCalledTimes(1);
    expect(mutatePedido).not.toHaveBeenCalled();
    const aviso = toastSpy.mock.calls
      .map((c) => c[0])
      .find((t) => t.title === 'Valor acordado não pedido');
    expect(aviso).toBeDefined();
    expect(aviso.variant).toBeUndefined();
    expect(navegarSpy).toHaveBeenCalled();
  });

  it('tarifa só com preço geral (sem linha do modelo) não é "sem preço"', async () => {
    PRECOS.splice(0, PRECOS.length);
    TARIFAS[0] = { ...TARIFAS[0], preco_semana: 225 };
    try {
      await abrirContrato('tvde', {});
    } finally {
      PRECOS.push(LINHA_PRECO);
      TARIFAS[0] = { ...TARIFAS[0], preco_semana: null };
    }
    expect(toastSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Contrato TVDE sem preço' })
    );
  });

  it('o valor acordado e o motivo nunca seguem no payload; o manual nasce null', async () => {
    await abrirContrato('tvde', { preco_semana_pretendido: 180, motivo_preco_semana: 'x' });
    const payload = mutateCriar.mock.calls[0][0];
    expect(payload.valor_total_manual).toBeNull();
    expect(payload).not.toHaveProperty('preco_semana_pretendido');
    expect(payload).not.toHaveProperty('motivo_preco_semana');
  });

  it('"faturar por período" é o único caminho que grava o valor manual', async () => {
    await abrirContrato('tvde', { valor_total_manual: 1400 });
    expect(mutateCriar.mock.calls[0][0].valor_total_manual).toBe(1400);
    expect(mutatePedido).not.toHaveBeenCalled();
  });

  it('um manual sozinho já não chega: sem preço de tarifa, recusa', async () => {
    PRECOS.splice(0, PRECOS.length);
    try {
      await abrirContrato('tvde', { valor_total_manual: 1400 });
    } finally {
      PRECOS.push(LINHA_PRECO);
    }
    expect(mutateCriar).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Contrato TVDE sem preço', variant: 'destructive' })
    );
  });

  it('a hidratação da reserva TVDE não copia o valor para o manual', () => {
    reservaDoServidor = reservaBase('tvde');
    const { result } = renderHook(() => useContratoForm(), { wrapper });
    expect(result.current.form.getValues('valor_total_manual')).toBeNull();
    expect(result.current.precoSemanaTarifaTvde).toBe(200);
  });
});

describe('abrir contrato rent-a-car: sem alterações', () => {
  it('nunca cria pedido e o payload mantém o valor manual da reserva', async () => {
    await abrirContrato('rent_a_car', { preco_semana_pretendido: 99 });

    expect(mutatePedido).not.toHaveBeenCalled();
    expect(mutateCriar.mock.calls[0][0]).toMatchObject({
      regime: 'rent_a_car',
      valor_total_manual: 175,
    });
  });
});

describe('mudar de regime na abertura limpa o que é do regime anterior', () => {
  async function hookTvde() {
    reservaDoServidor = reservaBase('tvde');
    const { result } = renderHook(() => useContratoForm(), { wrapper });
    act(() => {
      result.current.form.setValue('valor_total_manual', 1400);
      result.current.form.setValue('preco_semana_pretendido', 180);
      result.current.form.setValue('motivo_preco_semana', 'x');
    });
    return result;
  }

  it('TVDE para rent-a-car: o D1, o pretendido e o motivo não seguem', async () => {
    const result = await hookTvde();
    act(() => result.current.form.setValue('regime', 'rent_a_car'));
    expect(result.current.form.getValues('valor_total_manual')).toBeNull();
    expect(result.current.form.getValues('preco_semana_pretendido')).toBeNull();
    expect(result.current.form.getValues('motivo_preco_semana')).toBe('');
  });

  it('rent-a-car para TVDE: um manual do rent-a-car não segue', () => {
    reservaDoServidor = reservaBase('rent_a_car');
    const { result } = renderHook(() => useContratoForm(), { wrapper });
    expect(result.current.form.getValues('valor_total_manual')).toBe(175);
    act(() => result.current.form.setValue('regime', 'tvde'));
    expect(result.current.form.getValues('valor_total_manual')).toBeNull();
  });

  it('a hidratação da reserva não conta como mudança de regime', () => {
    reservaDoServidor = reservaBase('rent_a_car');
    const { result } = renderHook(() => useContratoForm(), { wrapper });
    expect(result.current.form.getValues('valor_total_manual')).toBe(175);
  });
});

describe('editar um contrato TVDE antigo', () => {
  it('sem modelo na viatura nem preço continua a guardar (a guarda é só da criação)', async () => {
    contratoDoServidor = {
      id: 'contrato-1',
      codigo: 1,
      cliente_id: CLIENTE_ID,
      viatura_id: '3f8c1c22-9999-4999-8999-999999999999',
      reserva_id: RESERVA_ID,
      emissor_id: EMISSOR_ID,
      regime: 'tvde',
      tarifa_id: TARIFA_ID,
      preco_semana_acordado: null,
      valor_total_manual: 300,
      data_inicio: '2026-09-09T13:00:00.000Z',
      data_fim: null,
      estado_operacional: 'em_curso',
      estado_financeiro: 'pendente',
      origem: 'sistema',
      taxa_iva: 0,
      is_longa_duracao: true,
      substituido_em: null,
    };
    const { result } = renderHook(() => useContratoForm(), { wrapper });
    await act(async () => {
      await (result.current.handleSubmit as unknown as () => Promise<void>)();
    });
    expect(toastSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Contrato TVDE sem preço' })
    );
    expect(mutarAtualizar).toHaveBeenCalledTimes(1);
    expect(mutarAtualizar.mock.calls[0][0]).toMatchObject({ valor_total_manual: 300 });
  });
});
