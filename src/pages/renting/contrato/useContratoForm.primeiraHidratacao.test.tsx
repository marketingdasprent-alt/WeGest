import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFieldArray } from 'react-hook-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useContratoForm } from './useContratoForm';
import type { Reserva } from '@/types/reserva';
import type { ExtraFormItem } from '@/types/contratoRenting';

// ─────────────────────────────────────────────────────────────────────────────
// Encenação: a PRIMEIRA hidratação chega tarde.
//
// O irmão deste ficheiro (useContratoForm.hidratacao.test.tsx) cobre o que
// acontece depois de o formulário já ter sido hidratado uma vez. Falta o
// princípio, que é onde dói: o efeito que semeia o contrato a partir da reserva
// faz `return` enquanto os condutores da reserva ou a lista de grupos não
// chegarem. Nessa espera o formulário JÁ ESTÁ no ecrã e a pessoa já lá escreve.
// Quando os dados finalmente chegam, corre o primeiro reset — e é esse que tem
// de respeitar o que foi escrito.
// ─────────────────────────────────────────────────────────────────────────────
let reservaDoServidor: Reserva | null = null;
let condutoresDaReserva: Array<{
  cliente_id: string | null;
  motorista_id: string | null;
  is_principal: boolean;
}> | null = null;
let gruposDoServidor: Array<{ id: string; nome: string }> = [];
let extrasDaReserva: Array<Record<string, unknown>> | null = null;

vi.mock('@/hooks/useReservas', () => ({
  useReserva: () => ({ data: reservaDoServidor, isLoading: false }),
}));

// `undefined` = ainda a carregar. É esta a condição que faz o efeito de
// hidratação desistir e voltar a tentar no render seguinte.
vi.mock('@/hooks/useReservaCondutores', () => ({
  useReservaCondutores: () => ({ data: condutoresDaReserva ?? undefined }),
}));

// `undefined` = ainda a carregar, tal como os condutores da reserva.
vi.mock('@/hooks/useReservaExtras', () => ({
  useReservaExtras: () => ({ data: extrasDaReserva ?? undefined }),
}));

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
  useRentingGruposMin: () => ({ data: gruposDoServidor }),
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
  useCancelarContratoRenting: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCriarVersaoContrato: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
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
    // Sem grupo gravado: obriga o efeito a resolvê-lo pela lista `grupos`, que
    // é o segundo motivo pelo qual a hidratação se atrasa.
    grupo: null,
    estacao_entrega_id: null,
    estacao_recolha_id: null,
    data_inicio: '2026-08-01T10:00:00.000Z',
    data_fim: '2026-08-16T10:00:00.000Z',
    cliente_id: '11111111-1111-1111-1111-111111111111',
    cliente_nome: 'Cliente Teste',
    condutor_id: null,
    condutor_nome: null,
    emissor_id: 'emissor-1',
    gestor_id: null,
    estado: 'confirmada',
    regime: 'rent_a_car',
    slot_valor_semanal: null,
    slot_valor_mensal: null,
    valor_total: 1350,
    valor_total_manual: null,
    tarifa_id: 'tarifa-1',
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

const VIA_VERDE: ExtraFormItem = {
  extra_id: 'ex-1',
  extra_nome: 'Via Verde - Mensal',
  preco_unidade: 15,
  tipo_calculo: 'fixo',
  quantidade: 1,
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={['/renting/contratos/novo?reserva_id=res-1']}>
      {children}
    </MemoryRouter>
  </QueryClientProvider>
);

beforeEach(() => {
  reservaDoServidor = reserva();
  // Ambas as dependências por chegar: a hidratação ainda não pode correr.
  condutoresDaReserva = null;
  gruposDoServidor = [];
  extrasDaReserva = [];
});

describe('useContratoForm — a primeira hidratação chega depois de o utilizador escrever', () => {
  it('não apaga o preço escrito à espera dos condutores da reserva', () => {
    gruposDoServidor = [{ id: 'g1', nome: 'B' }];
    const { result, rerender } = renderHook(() => useContratoForm(), { wrapper });

    // Ainda não hidratou — o formulário está no ecrã e a pessoa escreve.
    act(() => {
      result.current.form.setValue('valor_total_manual', 720, { shouldDirty: true });
    });

    // Chegam os condutores: corre a PRIMEIRA hidratação.
    condutoresDaReserva = [];
    rerender();

    // Sem isto, o preço escrito é substituído pelo `valor_total` da reserva.
    expect(result.current.form.getValues('valor_total_manual')).toBe(720);
  });

  it('não apaga os extras escritos à espera dos condutores da reserva', () => {
    gruposDoServidor = [{ id: 'g1', nome: 'B' }];
    const { result, rerender } = renderHook(() => useContratoForm(), { wrapper });

    act(() => {
      result.current.form.setValue('extras', [VIA_VERDE], { shouldDirty: true });
    });

    condutoresDaReserva = [];
    rerender();

    const extras = result.current.form.getValues('extras') as ExtraFormItem[];
    expect(extras).toHaveLength(1);
    expect(extras[0].extra_nome).toBe('Via Verde - Mensal');
  });

  // O outro atraso: a reserva não traz `grupo` e a lista de grupos ainda não
  // chegou, por isso o efeito faz `return` e volta a tentar. É a mesma janela.
  it('não apaga o que foi escrito à espera da lista de grupos', () => {
    condutoresDaReserva = [];
    const { result, rerender } = renderHook(() => useContratoForm(), { wrapper });

    act(() => {
      result.current.form.setValue('valor_total_manual', 720, { shouldDirty: true });
      result.current.form.setValue('extras', [VIA_VERDE], { shouldDirty: true });
    });

    gruposDoServidor = [{ id: 'g1', nome: 'B' }];
    rerender();

    expect(result.current.form.getValues('valor_total_manual')).toBe(720);
    expect(result.current.form.getValues('extras')).toHaveLength(1);
    // O que a pessoa NÃO tocou tem de vir da reserva na mesma — senão isto
    // estaria a testar "não hidrata", que é outro bug.
    expect(result.current.form.getValues('grupo')).toBe('B');
  });
});

describe('useContratoForm — extras da reserva ao criar o contrato', () => {
  it('chega com os extras da reserva pré-preenchidos', () => {
    gruposDoServidor = [{ id: 'g1', nome: 'B' }];
    condutoresDaReserva = [];
    extrasDaReserva = [
      {
        id: 're-1',
        reserva_id: 'res-1',
        extra_id: 'ex-1',
        extra_nome: 'Via Verde - Mensal',
        preco_unidade: 15,
        tipo_calculo: 'fixo',
        quantidade: 1,
      },
    ];

    const { result } = renderHook(() => useContratoForm(), { wrapper });

    const extras = result.current.form.getValues('extras') as ExtraFormItem[];
    expect(extras).toHaveLength(1);
    expect(extras[0]).toMatchObject({
      extra_id: 'ex-1',
      extra_nome: 'Via Verde - Mensal',
      preco_unidade: 15,
      tipo_calculo: 'fixo',
      quantidade: 1,
    });
  });

  // Chegam numa query à parte: se a hidratação corresse sem esperar por eles,
  // semeava uma lista vazia e nunca mais lá voltava.
  it('semeia-os mesmo quando a query dos extras resolve depois', () => {
    gruposDoServidor = [{ id: 'g1', nome: 'B' }];
    condutoresDaReserva = [];
    extrasDaReserva = null;

    const { result, rerender } = renderHook(() => useContratoForm(), { wrapper });

    extrasDaReserva = [
      {
        id: 're-1',
        reserva_id: 'res-1',
        extra_id: 'ex-1',
        extra_nome: 'Via Verde - Mensal',
        preco_unidade: 15,
        tipo_calculo: 'fixo',
        quantidade: 1,
      },
    ];
    rerender();

    expect(result.current.form.getValues('extras')).toHaveLength(1);
  });

  // O utilizador manda: se já tirou o extra que veio da reserva, hidratar de
  // novo não o pode ressuscitar.
  it('não ressuscita um extra que o utilizador apagou', () => {
    gruposDoServidor = [{ id: 'g1', nome: 'B' }];
    condutoresDaReserva = [];
    extrasDaReserva = [
      {
        id: 're-1',
        reserva_id: 'res-1',
        extra_id: 'ex-1',
        extra_nome: 'Via Verde - Mensal',
        preco_unidade: 15,
        tipo_calculo: 'fixo',
        quantidade: 1,
      },
    ];

    const { result, rerender } = renderHook(() => useContratoForm(), { wrapper });
    expect(result.current.form.getValues('extras')).toHaveLength(1);

    act(() => {
      result.current.form.setValue('extras', [], { shouldDirty: true });
    });
    reservaDoServidor = reserva({ valor_total: 1275 });
    rerender();

    expect(result.current.form.getValues('extras')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Quantas vezes a lista de extras é RECONSTRUÍDA.
//
// `form.reset` re-inicializa todas as instâncias de useFieldArray — é isso que
// as mantém em sincronia (ver o comentário no hook). O preço é que cada linha
// recebe um `id` novo, o React desmonta e volta a montar, e vê-se a lista a
// desaparecer e a reaparecer. Um reset por hidratação é inevitável; mais do que
// isso é o "saem e voltam".
// ─────────────────────────────────────────────────────────────────────────────
function useHarness() {
  const r = useContratoForm();
  const fa = useFieldArray({ control: r.form.control, name: 'extras' });
  return { form: r.form, ids: fa.fields.map((f) => f.id).join('|') };
}

const VIA_VERDE_DB = {
  id: 're-1',
  reserva_id: 'res-1',
  extra_id: 'ex-1',
  extra_nome: 'Via Verde - Mensal',
  preco_unidade: 15,
  tipo_calculo: 'fixo',
  quantidade: 1,
};

/** Nº de vezes que o conjunto de ids mudou depois de a lista já ter conteúdo. */
function contarReconstrucoes(historico: string[]): number {
  const comConteudo = historico.filter((h) => h !== '');
  let mudancas = 0;
  for (let i = 1; i < comConteudo.length; i++) {
    if (comConteudo[i] !== comConteudo[i - 1]) mudancas++;
  }
  return mudancas;
}

/**
 * "Saem e voltam": a lista tinha conteúdo, ficou vazia, e voltou a ter. É este
 * o sintoma descrito, e é invisível para contarReconstrucoes (que ignora os
 * estados vazios de propósito, para medir só remontagens).
 */
function contarDesaparecimentos(historico: string[]): number {
  let vistos = 0;
  let tinhaConteudo = false;
  let desapareceu = false;
  for (const h of historico) {
    if (h !== '') {
      if (desapareceu && tinhaConteudo) {
        vistos++;
        desapareceu = false;
      }
      tinhaConteudo = true;
    } else if (tinhaConteudo) {
      desapareceu = true;
    }
  }
  return vistos;
}

describe('useContratoForm — a lista de extras não pode piscar', () => {
  // A sequência REAL de arranque, pela ordem em que as queries resolvem ao vir
  // da reserva: primeiro nada, depois os condutores, depois o refetch da
  // reserva (que traz o que foi mesmo gravado), depois os extras. Cada reset
  // re-inicializa o useFieldArray e dá ids novos às linhas — o utilizador vê a
  // lista a desaparecer e a reaparecer a cada um.
  it('constrói a lista uma vez só durante o arranque vindo da reserva', () => {
    condutoresDaReserva = null;
    gruposDoServidor = [];
    extrasDaReserva = null;

    const historico: string[] = [];
    const { result, rerender } = renderHook(
      () => {
        const h = useHarness();
        historico.push(h.ids);
        return h;
      },
      { wrapper }
    );

    gruposDoServidor = [{ id: 'g1', nome: 'B' }];
    rerender();
    condutoresDaReserva = [];
    rerender();
    reservaDoServidor = reserva({ valor_total: 1275 });
    rerender();
    extrasDaReserva = [VIA_VERDE_DB];
    rerender();

    expect(result.current.form.getValues('extras')).toHaveLength(1);
    expect(contarReconstrucoes(historico)).toBe(0);
    expect(contarDesaparecimentos(historico)).toBe(0);
  });

  // A outra ordem de chegada: os extras (query pequena) resolvem ANTES do
  // refetch da reserva. O reset que o refetch provoca volta a passar pela lista.
  it('não pisca quando os extras chegam antes do refetch da reserva', () => {
    condutoresDaReserva = [];
    gruposDoServidor = [{ id: 'g1', nome: 'B' }];
    extrasDaReserva = null;

    const historico: string[] = [];
    const { result, rerender } = renderHook(
      () => {
        const h = useHarness();
        historico.push(h.ids);
        return h;
      },
      { wrapper }
    );

    extrasDaReserva = [VIA_VERDE_DB];
    rerender();
    expect(result.current.form.getValues('extras')).toHaveLength(1);

    // Chega o refetch da reserva com o valor mesmo gravado.
    reservaDoServidor = reserva({ valor_total: 1275 });
    rerender();

    expect(result.current.form.getValues('extras')).toHaveLength(1);
    expect(contarDesaparecimentos(historico)).toBe(0);
    expect(contarReconstrucoes(historico)).toBe(0);
  });
});
